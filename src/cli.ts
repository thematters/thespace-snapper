import { ethers } from "ethers";
import { create as createIPFS } from "ipfs-http-client";
import S3 from "aws-sdk/clients/s3";

import { takeSnapshot } from "./snapper";
import { fetchColorEvents } from "./events";
import { abi as thespaceABI } from "../abi/TheSpace.json";
import { abi as snapperABI } from "../abi/Snapper.json";

const main = async () => {
  if (process.argv.length < 7) {
    console.info(
      "Usage: node snapper.js <SignerPrivateKey> <TheSpaceContractAddress> <SnapperContractAddress> <RPC-url> <BatchSize>"
    );
    process.exit(-1);
  }
  const provider = new ethers.providers.JsonRpcProvider(process.argv[5]);
  const signer = new ethers.Wallet(process.argv[2], provider);
  const safeConfirmations = 2;
  const thespaceAddr = process.argv[3];
  const snapperAddr = process.argv[4];
  const theSpace = new ethers.Contract(thespaceAddr, thespaceABI, provider);
  const snapper = new ethers.Contract(snapperAddr, snapperABI, provider);
  const ipfs = createIPFS();
  const batchSize = parseInt(process.argv[6]);
  const s3 = new S3({
    apiVersion: "2006-03-01",
    region: process.argv[7],
    params: { Bucket: process.argv[8] },
  });

  const blocknum: number = await provider.getBlockNumber();

  if (safeConfirmations > blocknum) {
    throw Error(`blocks too few.`);
  }

  const [_lastToBlock, lastSnapShotCid] = await snapper.latestSnapshotInfo();
  const lastToBlock = _lastToBlock.toNumber();
  const stableBlock: number = blocknum + 1 - safeConfirmations;

  console.time("fetchColorEvents");
  const events = await fetchColorEvents(theSpace, lastToBlock + 1, stableBlock);
  console.timeEnd("fetchColorEvents");

  if (events.length < batchSize) {
    throw Error(`new Color events too few (count:${events.length}).`);
  }

  await takeSnapshot(
    lastToBlock,
    stableBlock,
    lastSnapShotCid,
    events,
    signer,
    snapper,
    ipfs,
    s3
  );
};

main();
