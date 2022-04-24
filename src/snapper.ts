import type { IPFS } from "ipfs-core-types";
import type { Event, Contract } from "ethers";
import type S3 from "aws-sdk/clients/s3";
import type { Delta } from "./types";

import { PNG, PackerOptions } from "pngjs";

import { applyChange, genDelta, readFileOnS3, readFileOnIFPS } from "./utils";
import { fetchSnapshotEvents, fetchDeltaEvents } from "./events";

export const takeSnapshot = async (
  lastToBlock: number,
  stableBlock: number,
  lastSnapShotCid: string,
  events: Event[],
  snapper: Contract,
  ipfs: IPFS,
  s3: S3
) => {
  // gen delta data
  console.time("genDelta");
  const delta: Delta = await genDelta(events);
  console.timeEnd("genDelta");

  // gen snapshot png file
  const lastSnapshot: Buffer = await readFileOnS3(lastSnapShotCid, s3);

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
  await s3
    .putObject(<S3.Types.PutObjectRequest>{ Key: deltaCid, Body: deltaString })
    .promise();
  await s3
    .putObject(<S3.Types.PutObjectRequest>{
      Key: snapshotCid,
      Body: snapshot,
      ContentType: "image/png",
    })
    .promise();

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

export const uploadSnapperFilesToS3 = async (
  snapper: Contract,
  ipfs: IPFS,
  s3: S3
) => {
  for (const e of await fetchSnapshotEvents(snapper)) {
    const cid = e.args!.cid;
    await s3
      .putObject(<S3.Types.PutObjectRequest>{
        Key: cid,
        Body: await readFileOnIFPS(cid, ipfs),
        ContentType: "image/png",
      })
      .promise();
  }
  for (const e of await fetchDeltaEvents(snapper)) {
    const cid = e.args!.cid;
    await s3
      .putObject(<S3.Types.PutObjectRequest>{
        Key: cid,
        Body: await readFileOnIFPS(cid, ipfs),
      })
      .promise();
  }
};
