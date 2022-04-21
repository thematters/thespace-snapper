import EventBridge from "aws-sdk/clients/eventbridge";

export const ruleNameFromEvent = (event: any): string | null => {
  return event?.resources?.[0]?.split(":rule/", 2)?.[1] || null;
};

export const lengthenCron = async (ruleName: string, max: number) => {
  await changeCron(ruleName, max);
};

export const changeCron = async (ruleName: string, mins: number) => {
  const eb = new EventBridge({ apiVersion: "2015-10-07" });
  await eb
    .putRule({ Name: ruleName, ScheduleExpression: `rate(${mins} minutes)` })
    .promise();
};
