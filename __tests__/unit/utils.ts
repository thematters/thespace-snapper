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
  process.env.THESPACE_ADDRESS = "0x01";
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

export const genFakeTheSpace = async (signer: ethers.Signer) => {
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
  const signerAddr = await signer.getAddress();
  //const registry = await registryFactory.deploy(
  //  token.address,
  //  signerAddr,
  //  signerAddr,
  //  signerAddr
  //);
  //await registry.deployTransaction.wait();
  //const tx = await token.approve(registry.address, ethers.constants.MaxUint256);
  //await tx.wait();
  //return registry;
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
  const snapper = await snapperFactory.deploy(block, cid);
  await snapper.deployTransaction.wait();
  return snapper;
};
