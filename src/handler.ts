import type { Contract, Event } from "ethers";
import type { Cron } from "./cron";
import type { Storage, IPFS } from "./storage";

import axios from "axios";
import { ethers } from "ethers";
import { AbortController } from "node-abort-controller";
import { nth, chunk } from "lodash";
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

  const MIN_COLORS_AMOUNT = 3000;
  const MAX_COLORS_AMOUNT = 3500;

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
    MIN_COLORS_AMOUNT,
    MAX_COLORS_AMOUNT,
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
  minColorsAmount: number,
  maxColorsAmount: number,
  registry: Contract,
  snapper: Contract,
  cron: Cron,
  ipfs: IPFS,
  storage: Storage
) => {
  const INTERVAL_MIN = 15; // mins
  const INTERVAL_MAX = 30; // mins

  if (safeConfirmations < 1) {
    throw Error("Invalid safeConfirmations value");
  }

  const regionId = 0;
  const latestBlockNum: number = await snapper.provider!.getBlockNumber();
  const [_lastSnapshotBlock, lastSnapshotCid] = await snapper[
    "latestSnapshotInfo(uint256)"
  ](regionId);
  const lastSnapshotBlockNum = _lastSnapshotBlock.toNumber();

  const newSnapshotBlockNum: number = latestBlockNum + 1 - safeConfirmations; // note that latestBlock's block confirmations is 1
  if (newSnapshotBlockNum <= lastSnapshotBlockNum) {
    console.log(`new blocks too few.`);
    return;
  }

  // upload snapshot and delta from ipfs to s3 if there is no file in bucket.

  if ((await storage.check(lastSnapshotCid)) === false) {
    console.time("syncSnapperFiles");
    await syncSnapperFiles(snapper, ipfs, storage);
    console.timeEnd("syncSnapperFiles");
  }

  // note that fetchColorEvents may take long time when too many Color events to fetch.

  console.time("fetchColorEvents");
  let _res = [];
  try {
    _res = await fetchColorEvents(registry, lastSnapshotBlockNum + 1);
  } catch (err) {
    _res = await fetchColorEvents(
      registry,
      lastSnapshotBlockNum + 1,
      newSnapshotBlockNum
    );
  }
  console.timeEnd("fetchColorEvents");
  const colors = _res.filter((e) => e.blockNumber <= newSnapshotBlockNum);

  // determine whether to change cron rate.

  if (await hasEventsRecently(colors)) {
    await cron.changeRate(INTERVAL_MIN);
    console.log(`cron set to ${INTERVAL_MIN} mins`);
  } else {
    await cron.changeRate(INTERVAL_MAX);
    console.log(`cron set to ${INTERVAL_MAX} mins`);
  }

  console.log(`new Color events amount: ${colors.length}`);
  if (colors.length < minColorsAmount) {
    console.log(`new Color events too few, quit.`);
    return;
  } else if (colors.length <= maxColorsAmount) {
    await takeSnapshot(
      lastSnapshotBlockNum,
      newSnapshotBlockNum,
      lastSnapshotCid,
      colors,
      snapper,
      ipfs,
      storage
    );
  } else {
    const colorss = chunk(colors, maxColorsAmount);
    const _lastSnapshotBlockNum = lastSnapshotBlockNum;
    let _lastSnapshotCid = lastSnapshotCid;
    let _newSnapshotBlockNum = 0;
    for (const _colors of colorss) {
      if (_colors.length < minColorsAmount) {
        continue;
      }
      _newSnapshotBlockNum = nth(_colors, -1)!.blockNumber;
      await takeSnapshot(
        _lastSnapshotBlockNum,
        _newSnapshotBlockNum,
        _lastSnapshotCid,
        _colors,
        snapper,
        ipfs,
        storage
      );
      const [_, cid] = await snapper["latestSnapshotInfo(uint256)"](regionId);
      _lastSnapshotCid = cid;
    }
  }
};

// helpers

const hasEventsRecently = async (events: Event[]): Promise<boolean> => {
  if (events.length == 0) {
    return false;
  }
  const lastestBlock = await nth(events, -1)?.getBlock();
  if (lastestBlock == undefined) {
    return false;
  }
  const tenMins = 10 * 60 * 1000;
  if (Date.now() - lastestBlock.timestamp * 1000 <= tenMins) {
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
  const defaultGasFee = ethers.BigNumber.from(40000000000);
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
