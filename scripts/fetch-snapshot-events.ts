import { ethers } from "ethers";
import { abi as snapperABI } from "../abi/Snapper.json";

const main = async () => {
  if (
    process.env.PROVIDER_RPC_HTTP_URL == undefined ||
    process.env.SNAPPER_ADDRESS == undefined
  ) {
    throw Error("please provede env vars");
  }
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.PROVIDER_RPC_HTTP_URL
  );
  const snapper = new ethers.Contract(
    process.env.SNAPPER_ADDRESS,
    snapperABI,
    provider
  );
  const events = await snapper.queryFilter(snapper.filters.Snapshot());
  for (const e of events) {
    const cid = e.args!.cid;
    const block = e.args!.block;
    const _timestamp: number = (await e.getBlock()).timestamp;
    const ISO: string = new Date(_timestamp * 1000).toISOString();
    console.log(`${ISO},${block},${cid}`);
  }
};

main();
