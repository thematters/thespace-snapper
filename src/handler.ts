import type { Contract } from "ethers";

import { ethers } from "ethers";
import { AbortController } from "node-abort-controller";
import { ObjectStorage, IPFS } from "./storage";
import { takeSnapshot } from "./transaction";
import {
  fetchColorEvents,
  fetchSnapshotEvents,
  fetchDeltaEvents,
} from "./events";
import { ruleNameFromEvent, changeCron } from "./cron";
import { hasEventsRecently } from "./utils";
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
  theSpace: Contract,
  snapper: Contract,
  safeConfirmations: number,
  cronRuleName: string | null,
  ipfs: IPFS,
  storage: ObjectStorage
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

  if ((await storage.check(lastSnapShotCid)) === false) {
    console.time("syncSnapperFiles");
    await syncSnapperFiles(snapper, ipfs, storage);
    console.timeEnd("syncSnapperFiles");
  }

  // note that fetchColorEvents may take long time with large blocks range.

  console.time("fetchColorEvents");
  const events = await fetchColorEvents(theSpace, lastToBlock + 1, latestBlock);
  console.timeEnd("fetchColorEvents");

  // determine whether to change cron rate.

  if (cronRuleName !== null) {
    if (hasEventsRecently(events, latestBlock - LATEST_BLOCKS)) {
      await changeCron(cronRuleName, INTERVAL_MIN);
    } else {
      await changeCron(cronRuleName, INTERVAL_MAX);
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
    storage
  );
};

const syncSnapperFiles = async (
  snapper: Contract,
  ipfs: IPFS,
  storage: ObjectStorage
) => {
  for (const e of await fetchSnapshotEvents(snapper)) {
    const cid = e.args!.cid;
    await storage.write(cid, await ipfs.read(cid), "image/png");
  }
  for (const e of await fetchDeltaEvents(snapper)) {
    const cid = e.args!.cid;
    await storage.write(cid, await ipfs.read(cid), "application/json");
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

  await _handler(
    theSpace,
    snapper,
    parseInt(process.env.SAFE_CONFIRMATIONS),
    ruleNameFromEvent(event),
    new IPFS(
      process.env.INFURA_IPFS_PROJECT_ID,
      process.env.INFURA_IPFS_PROJECT_SECRET
    ),
    new ObjectStorage(process.env.AWS_REGION, process.env.SNAPSHOT_BUCKET_NAME)
  );
};
