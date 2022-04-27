import { ruleNameFromEvent } from "../../src/cron";

describe("test ruleNameFromEvent", function () {
  it("can get name from expected events", () => {
    const event1 = {
      id: "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
      "detail-type": "Scheduled Event",
      source: "aws.events",
      account: "",
      time: "1970-01-01T00:00:00Z",
      region: "us-west-2",
      resources: ["arn:aws:events:us-west-2:123456789012:rule/ExampleRule"],
      detail: {},
    };
    expect(ruleNameFromEvent(event1)).toBe("ExampleRule");

    const event2 = {
      id: "cdc73f9d-aea9-11e3-9d5a-835b769c0d9c",
      "detail-type": "Scheduled Event",
      source: "aws.events",
      account: "",
      time: "1970-01-01T00:00:00Z",
      region: "us-west-2",
      resources: [
        "arn:aws:events:us-east-1:123456789012:rule/serverless-snapper-snapperCloudWatchEvent-1ETJBY8U4IZN4",
      ],
      detail: {},
    };
    expect(ruleNameFromEvent(event2)).toBe(
      "serverless-snapper-snapperCloudWatchEvent-1ETJBY8U4IZN4"
    );
  });
  it("return null from unexpected events", () => {
    const badEvent1 = {
      key1: "value1",
      key2: "value2",
      key3: "value3",
    };
    expect(ruleNameFromEvent(badEvent1)).toBe(null);

    const badEvent2 = { resources: [] };
    expect(ruleNameFromEvent(badEvent2)).toBe(null);

    const badEvent3 = { resources: [""] };
    expect(ruleNameFromEvent(badEvent3)).toBe(null);

    const badEvent4 = { resources: ["value"] };
    expect(ruleNameFromEvent(badEvent4)).toBe(null);
  });
});
