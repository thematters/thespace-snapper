import type { Event, Contract } from "ethers";

import { flatten } from "lodash";

export const fetchColorEvents = async (
  theSpace: Contract,
  fromBlock: number,
  toBlock: number
): Promise<Event[]> => {
  // work around getLogs api 2k block range limit
  const requests: Promise<Event[]>[] = [];
  let _fromBlock: number = fromBlock;
  let _toBlock: number = fromBlock + 1999;
  while (_toBlock < toBlock) {
    requests.push(
      theSpace.queryFilter(theSpace.filters.Color(), _fromBlock, _toBlock)
    );
    _fromBlock = _toBlock + 1;
    _toBlock = _fromBlock + 1999;
  }
  requests.push(
    theSpace.queryFilter(theSpace.filters.Color(), _fromBlock, toBlock)
  );
  console.log(`getLogs requests amount: ${requests.length}`);
  const res = await Promise.all(requests);
  return flatten(res);
};

export const fetchSnapshotEvents = async (
  snapper: Contract
): Promise<Event[]> => {
  return await snapper.queryFilter(snapper.filters.Snapshot());
};

export const fetchDeltaEvents = async (snapper: Contract): Promise<Event[]> => {
  return await snapper.queryFilter(snapper.filters.Delta());
};
