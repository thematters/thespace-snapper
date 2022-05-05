import type { Event } from "ethers";

import { handler, hasEventsRecently } from "../../src/handler";
import { genFakeProvider, genFakeTheSpace, genFakeSnapper } from "./utils";

const CID0 = "QmNjJFu6uJLbwNK3dHYfSX4SL2vbdWarDcnLQmtX2Hm3i0";

describe("Test handler", function () {
  it("Throw error if env not provided", async () => {
    const payload = {
      id: "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
      "detail-type": "Scheduled Event",
      source: "aws.events",
      account: "",
      time: "1970-01-01T00:00:00Z",
      region: "us-west-2",
      resources: ["arn:aws:events:us-west-2:123456789012:rule/ExampleRule"],
      detail: {},
    };

    await expect(handler(payload)).rejects.toThrowError(
      "All environment variables must be provided"
    );
  });
  it("mock stuff", async () => {
    const provider = genFakeProvider();
    const signer = provider.getSigner();
    const thespace = await genFakeTheSpace(signer);
    const snapper = await genFakeSnapper(
      signer,
      thespace.deployTransaction.blockNumber!,
      CID0
    );
  });
});

// test helpers

describe("test hasEventsRecently", function () {
  it("return false if events is empty", () => {
    expect(hasEventsRecently([], 10)).toBe(false);
  });
  it("return false if have no recent events", () => {
    expect(hasEventsRecently([{ blockNumber: 1 } as Event], 10)).toBe(false);
  });
  it("return true if have recent events", () => {
    expect(hasEventsRecently([{ blockNumber: 10 } as Event], 10)).toBe(true);
  });
});
