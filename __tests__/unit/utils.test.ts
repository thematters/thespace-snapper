import type { Event } from "ethers";
import { hasEventsRecently } from "../../src/utils";

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
