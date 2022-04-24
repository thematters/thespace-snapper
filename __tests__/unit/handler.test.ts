import { handler } from "../../src/handler";

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
});
