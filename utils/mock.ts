import { provider } from "ganache";
import { ethers } from "ethers";

import {
  abi as tokenABI,
  bytecode as tokenBytecode,
} from "../abi/SpaceToken.json";
import {
  abi as thespaceABI,
  bytecode as thespaceBytecode,
} from "../abi/TheSpace.json";
import { abi as snapperABI } from "../abi/Snapper.json";

export const genMockedProvider = () => {
  return new ethers.providers.Web3Provider(<any>provider());
};

// export const genMockedSigner = (provider: ethers.Provider) => {
//   return new ethers.Wallet(deployerPrivateKey, provider);
// }

export const genMockedTheSpace = async (signer: ethers.Signer) => {
  const cf = new ethers.ContractFactory(tokenABI, tokenBytecode, signer);
  return await cf.deploy();
  // const cf = new ethers.ContractFactory(thespaceABI, thespaceBytecode, signer);
  // return await cf.deploy(deployerAddress, deployerAddress, deployerAddress)
};
