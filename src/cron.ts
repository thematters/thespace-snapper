import EventBridge from "aws-sdk/clients/eventbridge";

export interface Cron {
  changeRate: (mins: number) => Promise<void>;
}

export class LambdaCron implements Cron {
  private eventBrige: EventBridge;
  private ruleName: string;

  constructor(ruleName: string) {
    this.eventBrige = new EventBridge({ apiVersion: "2015-10-07" });
    this.ruleName = ruleName;
  }

  async changeRate(mins: number): Promise<void> {
    const expression = mins === 1 ? "rate(1 minute)" : `rate(${mins} minutes)`;
    await this.eventBrige
      .putRule({ Name: this.ruleName, ScheduleExpression: expression })
      .promise();
  }
}

export const ruleNameFromEvent = (event: any): string | null => {
  return event?.resources?.[0]?.split(":rule/", 2)?.[1] || null;
};
