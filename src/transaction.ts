import type { IPFS } from "ipfs-core-types";
import type { Event, Contract } from "ethers";
import type { Delta } from "./types";

import { PNG, PackerOptions } from "pngjs";

import { Storage } from "./storage";
import { applyChange, genDelta } from "./utils";

export const takeSnapshot = async (
  lastToBlock: number,
  stableBlock: number,
  lastSnapShotCid: string,
  events: Event[],
  snapper: Contract,
  ipfs: IPFS,
  storage: Storage
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
  const { cid: deltaCid_ } = await ipfs.add({ content: deltaString });
  const deltaCid: string = deltaCid_.toString();
  const { cid: snapshotCid_ } = await ipfs.add({ content: snapshot });
  const snapshotCid: string = snapshotCid_.toString();
  // upload to s3
  await storage.write(deltaCid, deltaString, "application/json");
  await storage.write(snapshotCid, snapshot, "image/png");

  // take snapshot
  const tx = await snapper.takeSnapshot(
    lastToBlock,
    stableBlock,
    snapshotCid,
    deltaCid
  );
  await tx.wait();

  console.info(
    `snapper::emit: Snapshot(blocknum: ${lastToBlock}, cid: ${snapshotCid} ).`
  );
  console.info(
    `snapper::emit: Delta(blocknum: ${lastToBlock}, cid: ${deltaCid} ).`
  );
};
