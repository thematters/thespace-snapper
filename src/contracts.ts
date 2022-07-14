import type { Event, Contract, providers } from "ethers";
import type { Storage, IPFS } from "./storage";

import pLimit from "p-limit";
import { PNG, PackerOptions } from "pngjs";
import { chunk, nth, flatten } from "lodash";

// TYPES

export type TimestampedColorEvent = {
  bk: number;
  time: string;
  pixelId: number;
  colorId: number;
};

type BlockDelta = {
  bk: number;
  time: string;
  cs: {
    i: number;
    c: number;
  }[];
};

export type Delta = {
  delta: BlockDelta[];
  prev: string | null;
  snapshot: string;
  "snapshot offset": number;
};

// API

export const takeSnapshot = async (
  lastSnapshotBlock: number,
  newSnapshotBlock: number,
  lastSnapshotCid: string,
  lastDeltaCid: string | null,
  events: TimestampedColorEvent[],
  snapper: Contract,
  ipfs: IPFS,
  storage: Storage
) => {
  // gen snapshot png file
  const lastSnapshot: Buffer = await storage.read(lastSnapshotCid);

  const png = PNG.sync.read(lastSnapshot);
  paint(png, events);

  const options: PackerOptions = {
    colorType: 2,
    filterType: 0,
    deflateLevel: 9,
    deflateStrategy: 3,
  };
  const snapshot: Buffer = PNG.sync.write(png, options);

  // upload to ipfs and get cids
  const delta = JSON.stringify(genDelta(events, lastDeltaCid, lastSnapshotCid));
  const deltaCid = await ipfs.writeAndReturnCid(delta);
  const snapshotCid = await ipfs.writeAndReturnCid(snapshot);
  // upload to s3
  await storage.write(deltaCid, delta, "application/json");
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

  console.log(
    `emit Snapshot(blocknum: ${newSnapshotBlock}, cid: ${snapshotCid} )`
  );
  console.log(`emit Delta(blocknum: ${newSnapshotBlock}, cid: ${deltaCid} )`);
};

export const fetchColorEvents = async (
  theSpace: Contract,
  fromBlock: number,
  toBlock?: number
): Promise<Event[]> => {
  if (toBlock != null) {
    // work around getLogs api 2k block range limit and 1k events limit
    const limit = pLimit(3);
    const requests: Promise<Event[]>[] = [];
    let _fromBlock: number = fromBlock;
    let _toBlock: number = fromBlock + 499;
    while (_toBlock < toBlock) {
      requests.push(
        limit(
          (_from, _to) =>
            theSpace.queryFilter(theSpace.filters.Color(), _from, _to),
          _fromBlock,
          _toBlock
        )
      );
      _fromBlock = _toBlock + 1;
      _toBlock = _fromBlock + 499;
    }
    requests.push(
      limit(
        (_from, _to) =>
          theSpace.queryFilter(theSpace.filters.Color(), _from, _to),
        _fromBlock,
        toBlock
      )
    );
    console.log(`getLogs requests amount: ${requests.length}`);

    return flatten(await Promise.all(requests));
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

export const fetchLastDeltaCid = async (
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

export const deltaToTimestampedEvents = (
  delta: Delta
): TimestampedColorEvent[] => {
  const es = [];
  for (const d of delta.delta) {
    for (const c of d.cs) {
      es.push({
        bk: d.bk,
        time: d.time,
        pixelId: c.i,
        colorId: c.c,
      });
    }
  }
  return es;
};

export const toFakeTimestampedEvents = (
  events: Event[]
): TimestampedColorEvent[] => {
  return events.map((e) => {
    return {
      bk: e.blockNumber,
      time: "",
      pixelId: parseInt(e.args!.tokenId),
      colorId: parseInt(e.args!.color),
    };
  });
};

export const fulfillTimestamp = async (
  events: TimestampedColorEvent[],
  provider: providers.Provider
): Promise<TimestampedColorEvent[]> => {
  const fetchTime = async (bk: number): Promise<[number, string]> => [
    bk,
    new Date((await provider.getBlock(bk)).timestamp * 1000).toISOString(),
  ];
  const _bkAndTimes: Promise<[number, string]>[] = [];
  const limit = pLimit(5);
  const bks = new Set(events.filter((e) => e.time === "").map((e) => e.bk));
  bks.forEach((bk) => _bkAndTimes.push(limit((_bk) => fetchTime(_bk), bk)));
  const bkAndTimes = await Promise.all(_bkAndTimes);
  const timeRecord = Object.fromEntries(bkAndTimes);

  return events.map((e) => {
    return {
      bk: e.bk,
      time: e.time === "" ? timeRecord[e.bk] : e.time,
      pixelId: e.pixelId,
      colorId: e.colorId,
    };
  });
};

const genDelta = (
  events: TimestampedColorEvent[],
  lastDeltaCid: string | null,
  lastSnapshotCid: string
): Delta => {
  const delta: BlockDelta[] = [];
  for (const e of events) {
    if (delta.length === 0 || nth(delta, -1)!.bk !== e.bk) {
      delta.push({
        bk: e.bk,
        time: e.time,
        cs: [{ i: e.pixelId, c: e.colorId }],
      });
    } else {
      nth(delta, -1)!.cs.push({ i: e.pixelId, c: e.colorId });
    }
  }

  return {
    delta: delta,
    prev: lastDeltaCid,
    snapshot: lastSnapshotCid,
    "snapshot offset": 0,
  };
};

export const paint = (png: PNG, events: TimestampedColorEvent[]): void => {
  for (const e of events) {
    const tokenId = e.pixelId;
    const colorId = e.colorId;
    const idx = (tokenId - 1) * 4;
    const rgb = getRGB(colorId);
    png.data[idx] = (rgb >> 16) & 0xff;
    png.data[idx + 1] = (rgb >> 8) & 0xff;
    png.data[idx + 2] = rgb & 0xff;
    png.data[idx + 3] = 0xff;
  }
};

export const getRGB = (colorId: number): number => {
  const RGBs = [
    0x000000, 0xffffff, 0xd4d7d9, 0x898d90, 0x784102, 0xd26500, 0xff8a00,
    0xffde2f, 0x159800, 0x8de763, 0x58eaf4, 0x059df2, 0x034cba, 0x9503c9,
    0xd90041, 0xff9fab,
  ];
  if (colorId > 16 || colorId == 0) {
    return RGBs[0];
  } else {
    return RGBs[colorId - 1];
  }
};
