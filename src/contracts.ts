import type { Event, Contract } from "ethers";

import { PNG, PackerOptions } from "pngjs";
import { groupBy, toPairs, flatten, chunk } from "lodash";
import { ObjectStorage, IPFS } from "./storage";

type Change = {
  i: number;
  c: number;
};

export type BlockChange = {
  bk_num: number;
  time: string;
  cs: Change[];
};

export type Delta = {
  delta: BlockChange[];
};

export const takeSnapshot = async (
  lastSnapshotBlock: number,
  newSnapshotBlock: number,
  lastSnapShotCid: string,
  events: Event[],
  snapper: Contract,
  ipfs: IPFS,
  storage: ObjectStorage
) => {
  // gen delta data
  console.time("genDelta");
  const delta: Delta = await genDelta(events);
  console.timeEnd("genDelta");

  // gen snapshot png file
  const lastSnapshot: Buffer = await storage.read(lastSnapShotCid);

  const png = PNG.sync.read(lastSnapshot);
  applyChange(png, delta);

  const options: PackerOptions = {
    colorType: 2,
    filterType: 0,
    deflateLevel: 9,
    deflateStrategy: 3,
  };
  const snapshot: Buffer = PNG.sync.write(png, options);

  // upload to ipfs
  const deltaString = JSON.stringify(delta);
  const deltaCid = await ipfs.writeAndReturnCid(deltaString);
  const snapshotCid = await ipfs.writeAndReturnCid(snapshot);
  // upload to s3
  await storage.write(deltaCid, deltaString, "application/json");
  await storage.write(snapshotCid, snapshot, "image/png");

  // take snapshot
  const tx = await snapper.takeSnapshot(
    lastSnapshotBlock,
    newSnapshotBlock,
    snapshotCid,
    deltaCid
  );
  await tx.wait();

  console.info(
    `snapper::emit: Snapshot(blocknum: ${newSnapshotBlock}, cid: ${snapshotCid} ).`
  );
  console.info(
    `snapper::emit: Delta(blocknum: ${newSnapshotBlock}, cid: ${deltaCid} ).`
  );
};

export const fetchColorEvents = async (
  theSpace: Contract,
  fromBlock: number,
  toBlock: number
): Promise<Event[]> => {
  // work around getLogs api 2k block range limit
  const requests: Promise<Event[]>[] = [];
  let _fromBlock: number = fromBlock;
  let _toBlock: number = fromBlock + 1999;
  while (_toBlock < toBlock) {
    requests.push(
      theSpace.queryFilter(theSpace.filters.Color(), _fromBlock, _toBlock)
    );
    _fromBlock = _toBlock + 1;
    _toBlock = _fromBlock + 1999;
  }
  requests.push(
    theSpace.queryFilter(theSpace.filters.Color(), _fromBlock, toBlock)
  );
  console.log(`getLogs requests amount: ${requests.length}`);
  const res = await Promise.all(requests);
  return flatten(res);
};

export const fetchSnapshotEvents = async (
  snapper: Contract
): Promise<Event[]> => {
  return await snapper.queryFilter(snapper.filters.Snapshot());
};

export const fetchDeltaEvents = async (snapper: Contract): Promise<Event[]> => {
  return await snapper.queryFilter(snapper.filters.Delta());
};

// helpers

const genDelta = async (events: Event[]): Promise<Delta> => {
  const eventsByBlock = toPairs(groupBy(events, (e: Event) => e.blockNumber));
  console.log(`Color events blocks amount: ${eventsByBlock.length}`);

  const marshal = async (item: [string, Event[]]): Promise<BlockChange> => {
    const [bkNum, es] = item;
    const timestamp: number = (await es[0].getBlock()).timestamp;
    const ISO: string = new Date(timestamp * 1000).toISOString();
    return {
      bk_num: parseInt(bkNum),
      time: ISO,
      cs: es.map((e: Event) => ({
        i: parseInt(e.args!.pixelId),
        c: parseInt(e.args!.color),
      })),
    };
  };

  const res: BlockChange[][] = [];
  const chunks: [string, Event[]][][] = chunk(eventsByBlock, 500);

  for (const chunk of chunks) {
    res.push(await Promise.all(chunk.map(marshal)));
  }

  return { delta: flatten(res) };
};

export const applyChange = (png: PNG, delta: Delta): void => {
  const RGBs = [
    0x000000, 0xffffff, 0xd4d7d9, 0x898d90, 0x784102, 0xd26500, 0xff8a00,
    0xffde2f, 0x159800, 0x8de763, 0x58eaf4, 0x059df2, 0x034cba, 0x9503c9,
    0xd90041, 0xff9fab,
  ];

  for (const bcs of delta.delta) {
    for (const c of bcs.cs) {
      const idx = c.i * 4;
      const rgb = RGBs[c.c];
      png.data[idx] = (rgb >> 16) & 0xff;
      png.data[idx + 1] = (rgb >> 8) & 0xff;
      png.data[idx + 2] = rgb & 0xff;
      png.data[idx + 3] = 0xff;
    }
  }
};