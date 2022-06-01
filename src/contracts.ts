import type { Event, Contract } from "ethers";
import type { Storage, IPFS } from "./storage";

import { PNG, PackerOptions } from "pngjs";
import { groupBy, toPairs, flatten, chunk } from "lodash";

type Change = {
  i: number;
  c: number;
};

export type BlockChange = {
  bk: number;
  time: string;
  cs: Change[];
};

export type Delta = {
  delta: BlockChange[];
  prev: string | null;
  snapshot: string;
};

export const takeSnapshot = async (
  lastSnapshotBlock: number,
  newSnapshotBlock: number,
  lastSnapShotCid: string,
  events: Event[],
  snapper: Contract,
  ipfs: IPFS,
  storage: Storage
) => {
  // gen delta data
  console.time("genDelta");
  const delta: Delta = await genDelta(
    events,
    await getLastDeltaCid(snapper, lastSnapshotBlock),
    lastSnapShotCid
  );
  console.timeEnd("genDelta");

  // gen snapshot png file
  const lastSnapshot: Buffer = await storage.read(lastSnapShotCid);

  const png = PNG.sync.read(lastSnapshot);
  applyChange(png, events);

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
  console.time("take snapshot tx");
  const regionId = 0;
  const tx = await snapper.takeSnapshot(
    regionId,
    lastSnapshotBlock,
    newSnapshotBlock,
    snapshotCid,
    deltaCid
  );
  await tx.wait();
  console.timeEnd("take snapshot tx");

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
  toBlock?: number
): Promise<Event[]> => {
  if (toBlock != null) {
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
  } else {
    return await theSpace.queryFilter(theSpace.filters.Color(), fromBlock);
  }
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

const getLastDeltaCid = async (
  snapper: Contract,
  lastSnapshotBlock: number
): Promise<string | null> => {
  const deltaEvents = await snapper.queryFilter(
    snapper.filters.Delta(),
    lastSnapshotBlock
  );
  if (deltaEvents.length === 0) {
    return null;
  } else {
    return deltaEvents[deltaEvents.length - 1].args!.cid;
  }
};

const genDelta = async (
  events: Event[],
  lastDeltaCid: string | null,
  lastSnapshotCid: string
): Promise<Delta> => {
  const eventsByBlock = toPairs(groupBy(events, (e: Event) => e.blockNumber));
  console.log(`eth_getBlockByHash requests amount: ${eventsByBlock.length}`);

  const marshal = async (item: [string, Event[]]): Promise<BlockChange> => {
    const [bkNum, es] = item;
    const timestamp: number = (await es[0].getBlock()).timestamp;
    const ISO: string = new Date(timestamp * 1000).toISOString();
    return {
      bk: parseInt(bkNum),
      time: ISO,
      cs: es.map((e: Event) => ({
        i: parseInt(e.args!.tokenId),
        c: parseInt(e.args!.color),
      })),
    };
  };

  const res: BlockChange[][] = [];
  const chunks: [string, Event[]][][] = chunk(eventsByBlock, 500);

  for (const chunk of chunks) {
    res.push(await Promise.all(chunk.map(marshal)));
  }

  return {
    delta: flatten(res),
    prev: lastDeltaCid,
    snapshot: lastSnapshotCid,
  };
};

export const applyChange = (png: PNG, events: Event[]): void => {
  const RGBs = [
    0x000000, 0xffffff, 0xd4d7d9, 0x898d90, 0x784102, 0xd26500, 0xff8a00,
    0xffde2f, 0x159800, 0x8de763, 0x58eaf4, 0x059df2, 0x034cba, 0x9503c9,
    0xd90041, 0xff9fab,
  ];

  for (const e of events) {
    const tokenId = parseInt(e.args!.tokenId);
    const color = parseInt(e.args!.color);
    const idx = (tokenId - 1) * 4;
    const rgb = RGBs[color - 1];
    png.data[idx] = (rgb >> 16) & 0xff;
    png.data[idx + 1] = (rgb >> 8) & 0xff;
    png.data[idx + 2] = rgb & 0xff;
    png.data[idx + 3] = 0xff;
  }
};
