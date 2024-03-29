import type { Contract, Event } from "ethers";
import type { Cron } from "../../src/cron";
import type { Storage, IPFS } from "../../src/storage";

import axios from "axios";
import { ethers } from "ethers";
import { handler, _handler, getFeeDataFromPolygon } from "../../src/handler";
import {
  prepareEnv,
  genFakeProvider,
  genFakeTheSpaceRegistry,
  genFakeSnapper,
  S3StorageStub,
  IpfsStub,
  EmptyS3StorageStub,
} from "./utils";

const CID0 = "QmNjJFu6uJLbwNK3dHYfSX4SL2vbdWarDcnLQmtX2Hm3i0";
const EVENT = {
  id: "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
  "detail-type": "Scheduled Event",
  source: "aws.events",
  account: "",
  time: "1970-01-01T00:00:00Z",
  region: "us-west-2",
  resources: ["arn:aws:events:us-west-2:123456789012:rule/ExampleRule"],
  detail: {},
};

describe("handler", function () {
  beforeEach(() => {
    prepareEnv();
  });

  it("throw error if any env not provided", async () => {
    delete process.env.INFURA_IPFS_PROJECT_ID;
    expect(process.env.INFURA_IPFS_PROJECT_ID).toBeUndefined();

    await expect(handler(EVENT)).rejects.toThrowError(
      "All environment variables must be provided"
    );
  });
});

describe("_handler", function () {
  let provider: ethers.providers.Web3Provider;
  let registry: Contract;
  let initSnapshotBlock: number;
  let snapper: Contract;
  let storage: Storage;
  let ipfs: IPFS;
  beforeEach(async () => {
    provider = genFakeProvider();
    const signer = provider.getSigner();
    registry = await genFakeTheSpaceRegistry(signer);
    initSnapshotBlock = registry.deployTransaction.blockNumber!;
    snapper = await genFakeSnapper(signer, initSnapshotBlock, CID0);
    storage = new S3StorageStub();
    ipfs = new IpfsStub();
  });
  it("throw Error if safeConfirmations is 0", async () => {
    await expect(
      _handler(0, 10, 10, registry, snapper, ipfs, storage)
    ).rejects.toThrowError("Invalid safeConfirmations value");
  });
  it("new blocks too few.", async () => {
    const consoleSpy = jest.spyOn(console, "log");
    await _handler(10, 10, 10, registry, snapper, ipfs, storage);
    expect(consoleSpy).toHaveBeenCalledWith("new blocks too few.");
  });
  it("sync files from ipfs to s3 if lastest snapshot file not in s3", async () => {
    const consoleSpy = jest.spyOn(console, "time");
    await _handler(
      1,
      10,
      10,
      registry,
      snapper,
      ipfs,
      new EmptyS3StorageStub()
    );
    expect(consoleSpy).toHaveBeenCalledWith("syncSnapperFiles");
  });
  it("take snapshot if color events amount >= MIN_COLORS_AMOUNT and <= MAX_COLORS_AMOUNT", async () => {
    const tx = await registry.setColor(
      1,
      1,
      "0x67B94473D81D0cd00849D563C94d0432Ac988B49"
    );
    await tx.wait();
    const consoleSpy = jest.spyOn(console, "log");
    await _handler(1, 1, 10, registry, snapper, ipfs, storage);
    expect(consoleSpy).toHaveBeenCalledWith("new Color events amount: 1");
    expect(consoleSpy).toHaveBeenCalledWith(
      "emit Snapshot(blocknum: 6, cid: QmX8acbms98niW1XT39cYgsDJJvs5F2JJmv8fkAuccWNYN )"
    );
  });
  it("take snapshots if color events amount >= MAX_COLORS_AMOUNT", async () => {
    const tx1 = await registry.setColor(
      1,
      1,
      "0x67B94473D81D0cd00849D563C94d0432Ac988B49"
    );
    await tx1.wait();
    const tx2 = await registry.setColor(
      2,
      2,
      "0x67B94473D81D0cd00849D563C94d0432Ac988B49"
    );
    await tx2.wait();
    const tx3 = await registry.setColor(
      3,
      3,
      "0x67B94473D81D0cd00849D563C94d0432Ac988B49"
    );
    await tx3.wait();
    const consoleSpy = jest.spyOn(console, "log");
    await _handler(1, 1, 2, registry, snapper, ipfs, storage);
    expect(consoleSpy).toHaveBeenCalledWith("new Color events amount: 3");
    expect(consoleSpy).toHaveBeenCalledWith(
      "emit Snapshot(blocknum: 7, cid: QmX8acbms98niW1XT39cYgsDJJvs5F2JJmv8fkAuccWNYN )"
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "emit Snapshot(blocknum: 8, cid: QmX8acbms98niW1XT39cYgsDJJvs5F2JJmv8fkAuccWNYN )"
    );
  });
});

// test helpers

describe("getFeeDataFromPolygon", function () {
  it("success", async () => {
    const data = await getFeeDataFromPolygon();
    expect(data.gasPrice).toBeNull();
  });
});
