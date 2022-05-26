import type { Cron } from "../../src/cron";
import type { Storage, IPFS } from "../../src/storage";

import { provider } from "ganache";
import { ethers } from "ethers";

import {
  abi as tokenABI,
  bytecode as tokenBytecode,
} from "../../abi/SpaceToken.json";
import {
  abi as registryABI,
  bytecode as registryBytecode,
} from "../../abi/TheSpaceRegistry.json";
import {
  abi as snapperABI,
  bytecode as snapperBytecode,
} from "../../abi/Snapper.json";

export const prepareEnv = () => {
  process.env.PROVIDER_RPC_HTTP_URL = "https://";
  process.env.PRIVATE_KEY = "private key";
  process.env.REGISTRY_ADDRESS = "0x01";
  process.env.SNAPPER_ADDRESS = "0x02";
  process.env.INFURA_IPFS_PROJECT_ID = "infura id";
  process.env.INFURA_IPFS_PROJECT_SECRET = "infura secret";
  process.env.SNAPSHOT_BUCKET_NAME = "bucket name";
  process.env.SAFE_CONFIRMATIONS = "127";
  process.env.AWS_REGION = "us-east-1";
};

export const genFakeProvider = () => {
  return new ethers.providers.Web3Provider(<any>provider());
};

export const genFakeTheSpaceRegistry = async (signer: ethers.Signer) => {
  const tokenFactory = new ethers.ContractFactory(
    tokenABI,
    tokenBytecode,
    signer
  );
  const token = await tokenFactory.deploy();
  await token.deployTransaction.wait();
  const registryFactory = new ethers.ContractFactory(
    registryABI,
    registryBytecode,
    signer
  );
  const registry = await registryFactory.deploy(
    "Kcnalp",
    "KLP",
    1000000,
    75,
    500,
    10000000000,
    token.address
  );
  await registry.deployTransaction.wait();
  const tx = await token.approve(registry.address, ethers.constants.MaxUint256);
  await tx.wait();
  return registry;
};

export const genFakeSnapper = async (
  signer: ethers.Signer,
  block: number,
  cid: string
) => {
  const snapperFactory = new ethers.ContractFactory(
    snapperABI,
    snapperBytecode,
    signer
  );
  const snapper = await snapperFactory.deploy();
  await snapper.deployTransaction.wait();
  await snapper.initRegion(0, block, cid);
  return snapper;
};

export class CronStub implements Cron {
  async changeRate(mins: number): Promise<void> {
    console.debug(mins);
  }
}

export class S3StorageStub implements Storage {
  async check(key: string): Promise<boolean> {
    return true;
  }
  async read(key: string): Promise<Buffer> {
    return new Buffer("");
  }
  async write(key: string, data: Buffer | string, contentType: string) {
    console.debug(key);
    console.debug(data);
  }
}

export class IpfsStub implements IPFS {
  async read(key: string): Promise<Buffer> {
    return new Buffer("");
  }
  async writeAndReturnCid(data: Buffer | string): Promise<string> {
    return "QmX8acbms98niW1XT39cYgsDJJvs5F2JJmv8fkAuccWNYN";
  }
}
