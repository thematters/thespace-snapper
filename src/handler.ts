import type { IPFS } from "ipfs-core-types";
import type { Contract } from "ethers";

import { ethers } from "ethers";
import { create as createIPFS } from "ipfs-http-client";
import { AbortController } from "node-abort-controller";
import S3 from "aws-sdk/clients/s3";
import { takeSnapshot } from "./transaction";
import {
  fetchColorEvents,
  fetchSnapshotEvents,
  fetchDeltaEvents,
} from "./events";
import { ruleNameFromEvent, changeCron } from "./cron";
import { hasEventsRecently, readFileOnIFPS } from "./utils";
import { abi as thespaceABI } from "../abi/TheSpace.json";
import { abi as snapperABI } from "../abi/Snapper.json";

// polyfill node14 for aws lambda

globalThis.AbortController = AbortController;

// constants

const LATEST_BLOCKS = 300; // roughly 10 mins
const INTERVAL_MIN = 20; // min.
const INTERVAL_MAX = 100; // min.
const COLOR_EVENTS_THRESHOLD = 100;

// main

const _handler = async (
  event: any,
  theSpace: Contract,
  snapper: Contract,
  safeConfirmations: number,
  ipfs: IPFS,
  s3: S3
) => {
  const latestBlock: number = await snapper.provider!.getBlockNumber();

  if (safeConfirmations > latestBlock) {
    console.log(`blocks too few.`);
    return;
  }

  const [_lastToBlock, lastSnapShotCid] = await snapper.latestSnapshotInfo();
  const lastToBlock = _lastToBlock.toNumber();
  const stableBlock: number = latestBlock + 1 - safeConfirmations;

  // upload snapshot and delta from ipfs to s3 if there is no file in bucket.

  try {
    await s3
      .headObject({ Key: lastSnapShotCid } as S3.Types.HeadObjectRequest)
      .promise();
  } catch (err: any) {
    if (err?.code == "NotFound") {
      console.time("uploadSnapperFilesToS3");
      await uploadSnapperFilesToS3(snapper, ipfs, s3);
      console.timeEnd("uploadSnapperFilesToS3");
    } else {
      throw err;
    }
  }

  // note that fetchColorEvents may take long time with large blocks range.

  console.time("fetchColorEvents");
  const events = await fetchColorEvents(theSpace, lastToBlock + 1, latestBlock);
  console.timeEnd("fetchColorEvents");

  // determine whether to change cron rate.

  const ruleName = ruleNameFromEvent(event);
  if (ruleName !== null) {
    if (hasEventsRecently(events, latestBlock - LATEST_BLOCKS)) {
      await changeCron(ruleName, INTERVAL_MIN);
    } else {
      await changeCron(ruleName, INTERVAL_MAX);
    }
  }

  if (events.length < COLOR_EVENTS_THRESHOLD) {
    console.log(`new Color events too few (count:${events.length}).`);
    return;
  }

  await takeSnapshot(
    lastToBlock,
    stableBlock,
    lastSnapShotCid,
    events.filter((e) => e.blockNumber <= stableBlock),
    snapper,
    ipfs,
    s3
  );
};

const uploadSnapperFilesToS3 = async (
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

// export handler function

export const handler = async (event: any) => {
  if (
    process.env.PROVIDER_RPC_HTTP_URL === undefined ||
    process.env.PRIVATE_KEY === undefined ||
    process.env.THESPACE_ADDRESS === undefined ||
    process.env.SNAPPER_ADDRESS === undefined ||
    process.env.INFURA_IPFS_PROJECT_ID === undefined ||
    process.env.INFURA_IPFS_PROJECT_SECRET === undefined ||
    process.env.SNAPSHOT_BUCKET_NAME === undefined ||
    process.env.SAFE_CONFIRMATIONS === undefined ||
    process.env.AWS_REGION === undefined
  ) {
    throw Error("All environment variables must be provided");
  }
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.PROVIDER_RPC_HTTP_URL
  );
  const theSpace = new ethers.Contract(
    process.env.THESPACE_ADDRESS,
    thespaceABI,
    provider
  );
  const snapper = new ethers.Contract(
    process.env.SNAPPER_ADDRESS,
    snapperABI,
    provider
  );
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  snapper.connect(signer);

  const infura_auth =
    "Basic " +
    Buffer.from(
      process.env.INFURA_IPFS_PROJECT_ID +
        ":" +
        process.env.INFURA_IPFS_PROJECT_SECRET
    ).toString("base64");
  const ipfs = createIPFS({
    host: "ipfs.infura.io",
    port: 5001,
    protocol: "https",
    headers: {
      authorization: infura_auth,
    },
  });
  const s3 = new S3({
    apiVersion: "2006-03-01",
    region: process.env.AWS_REGION,
    params: { Bucket: process.env.SNAPSHOT_BUCKET_NAME },
  });

  await _handler(
    event,
    theSpace,
    snapper,
    parseInt(process.env.SAFE_CONFIRMATIONS),
    ipfs,
    s3
  );
};
