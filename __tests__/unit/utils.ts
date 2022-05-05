import { provider } from "ganache";
import { ethers } from "ethers";

import {
  abi as tokenABI,
  bytecode as tokenBytecode,
} from "../../abi/SpaceToken.json";
import {
  abi as thespaceABI,
  bytecode as thespaceBytecode,
} from "../../abi/TheSpace.json";
import {
  abi as snapperABI,
  bytecode as snapperBytecode,
} from "../../abi/Snapper.json";

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
  const thespaceFactory = new ethers.ContractFactory(
    thespaceABI,
    thespaceBytecode,
    signer
  );
  const signerAddr = await signer.getAddress();
  const thespace = await thespaceFactory.deploy(
    token.address,
    signerAddr,
    signerAddr,
    signerAddr
  );
  await thespace.deployTransaction.wait();
  const tx = await token.approve(thespace.address, ethers.constants.MaxUint256);
  await tx.wait();
  return thespace;
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
