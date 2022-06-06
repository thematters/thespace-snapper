import type { Contract, Event } from "ethers";
import type { Cron } from "./cron";
import type { Storage, IPFS } from "./storage";

import axios from "axios";
import { ethers } from "ethers";
import { AbortController } from "node-abort-controller";
import { nth } from "lodash";
import { S3Storage, IpfsStorage } from "./storage";
import {
  takeSnapshot,
  fetchColorEvents,
  fetchSnapshotEvents,
  fetchDeltaEvents,
} from "./contracts";
import { LambdaCron, ruleNameFromEvent } from "./cron";
import { abi as registryABI } from "../abi/TheSpaceRegistry.json";
import { abi as snapperABI } from "../abi/Snapper.json";

// polyfill node14 for aws lambda

globalThis.AbortController = AbortController;

// main

export const handler = async (event: any) => {
  if (
    process.env.PROVIDER_RPC_HTTP_URL === undefined ||
    process.env.PRIVATE_KEY === undefined ||
    process.env.REGISTRY_ADDRESS === undefined ||
    process.env.SNAPPER_ADDRESS === undefined ||
    process.env.INFURA_IPFS_PROJECT_ID === undefined ||
    process.env.INFURA_IPFS_PROJECT_SECRET === undefined ||
    process.env.SNAPSHOT_BUCKET_NAME === undefined ||
    process.env.SAFE_CONFIRMATIONS === undefined ||
    process.env.AWS_REGION === undefined
  ) {
    throw Error("All environment variables must be provided");
  }

  const COLOR_EVENTS_SNAPSHOT_THRESHOLD = 3000;

  const cronRuleName = ruleNameFromEvent(event);
  if (cronRuleName === null) {
    throw Error("Not a schedule event");
  }

  const provider = new ethers.providers.JsonRpcProvider(
    process.env.PROVIDER_RPC_HTTP_URL
  );
  const registry = new ethers.Contract(
    process.env.REGISTRY_ADDRESS,
    registryABI,
    provider
  );

  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  // work around polygon underpriced proplem, see https://github.com/ethers-io/ethers.js/issues/2828
  signer.getFeeData = getFeeDataFromPolygon;

  const snapper = new ethers.Contract(
    process.env.SNAPPER_ADDRESS,
    snapperABI,
    signer
  );

  await _handler(
    parseInt(process.env.SAFE_CONFIRMATIONS),
    COLOR_EVENTS_SNAPSHOT_THRESHOLD,
    registry,
    snapper,
    new LambdaCron(cronRuleName),
    new IpfsStorage(
      process.env.INFURA_IPFS_PROJECT_ID,
      process.env.INFURA_IPFS_PROJECT_SECRET
    ),
    new S3Storage(process.env.AWS_REGION, process.env.SNAPSHOT_BUCKET_NAME)
  );
};

export const _handler = async (
  safeConfirmations: number,
  snapshotThreshold: number,
  registry: Contract,
  snapper: Contract,
  cron: Cron,
  ipfs: IPFS,
  storage: Storage
) => {
  const LATEST_BLOCKS = 300; // roughly 10 mins
  const INTERVAL_MIN = 15; // mins
  const INTERVAL_MAX = 60; // mins

  if (safeConfirmations < 1) {
    throw Error("Invalid safeConfirmations value");
  }

  const regionId = 0;
  const latestBlock: number = await snapper.provider!.getBlockNumber();
  const [_lastSnapshotBlock, lastSnapShotCid] = await snapper[
    "latestSnapshotInfo(uint256)"
  ](regionId);
  const lastSnapshotBlock = _lastSnapshotBlock.toNumber();

  const newSnapshotBlock: number = latestBlock + 1 - safeConfirmations; // note that latestBlock's block confirmations is 1
  if (newSnapshotBlock <= lastSnapshotBlock) {
    console.log(`new blocks too few.`);
    return;
  }

  // upload snapshot and delta from ipfs to s3 if there is no file in bucket.

  if ((await storage.check(lastSnapShotCid)) === false) {
    console.time("syncSnapperFiles");
    await syncSnapperFiles(snapper, ipfs, storage);
    console.timeEnd("syncSnapperFiles");
  }

  // note that fetchColorEvents may take long time when too many Color events to fetch.

  console.time("fetchColorEvents");
  const colors = await fetchColorEvents(registry, lastSnapshotBlock + 1);
  console.timeEnd("fetchColorEvents");

  // determine whether to change cron rate.

  if (hasEventsRecently(colors, latestBlock - LATEST_BLOCKS)) {
    await cron.changeRate(INTERVAL_MIN);
  } else {
    await cron.changeRate(INTERVAL_MAX);
  }

  console.log(`new Color events amount: ${colors.length}`);
  if (colors.length < snapshotThreshold) {
    console.log(`new Color events too few, quit.`);
    return;
  }

  await takeSnapshot(
    lastSnapshotBlock,
    newSnapshotBlock,
    lastSnapShotCid,
    colors.filter((e) => e.blockNumber <= newSnapshotBlock),
    snapper,
    ipfs,
    storage
  );
};

// helpers

export const hasEventsRecently = (
  events: Event[],
  recentBlock: number
): boolean => {
  const lastBlock = nth(events, -1)?.blockNumber;
  if (lastBlock == undefined) {
    return false;
  }
  if (lastBlock >= recentBlock) {
    return true;
  } else {
    return false;
  }
};

const syncSnapperFiles = async (
  snapper: Contract,
  ipfs: IPFS,
  storage: Storage
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

export const getFeeDataFromPolygon = async () => {
  const defaultGasFee = ethers.BigNumber.from(30000000000);
  let maxFeePerGas, maxPriorityFeePerGas, gasPrice;
  try {
    const { data } = await axios({
      method: "get",
      url: "https://gasstation-mainnet.matic.network/v2",
    });
    maxFeePerGas = ethers.utils.parseUnits(
      Math.ceil(data.safeLow.maxFee) + "",
      "gwei"
    );
    maxPriorityFeePerGas = ethers.utils.parseUnits(
      Math.ceil(data.safeLow.maxPriorityFee) + "",
      "gwei"
    );
    gasPrice = null;
  } catch (err) {
    console.warn(err);
    maxFeePerGas = defaultGasFee;
    maxPriorityFeePerGas = defaultGasFee;
    gasPrice = defaultGasFee;
  }
  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasPrice,
  };
};
