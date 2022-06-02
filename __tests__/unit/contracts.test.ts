import { getRGB } from "../../src/contracts";

describe("test getRGB", function () {
  it("handle any numbers", () => {
    expect(getRGB(0)).toBe(0x000000);

    expect(getRGB(1)).toBe(0x000000);
    expect(getRGB(2)).toBe(0xffffff);
    expect(getRGB(16)).toBe(0xff9fab);

    expect(getRGB(17)).toBe(0x000000);
  });
});
