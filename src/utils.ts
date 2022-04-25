import type { Event } from "ethers";
import type { Delta, BlockChange } from "./types";
import type { PNG } from "pngjs";

import { groupBy, toPairs, flatten, chunk, nth } from "lodash";

export const hasEventsRecently = (
  events: Event[],
  recentBlock: number
): boolean => {
  const lastBlock = nth(events, -1)?.blockNumber;
  if (lastBlock == undefined) {
    return false;
  }
  if (lastBlock >= recentBlock) {
    return true;
  } else {
    return false;
  }
};

export const genDelta = async (events: Event[]): Promise<Delta> => {
  const eventsByBlock = toPairs(groupBy(events, (e: Event) => e.blockNumber));
  console.log(`Color events blocks amount: ${eventsByBlock.length}`);

  const marshal = async (item: [string, Event[]]): Promise<BlockChange> => {
    const [bkNum, es] = item;
    const timestamp: number = (await es[0].getBlock()).timestamp;
    const ISO: string = new Date(timestamp * 1000).toISOString();
    return {
      bk_num: parseInt(bkNum),
      time: ISO,
      cs: es.map((e: Event) => ({
        i: parseInt(e.args!.pixelId),
        c: parseInt(e.args!.color),
      })),
    };
  };

  const res: BlockChange[][] = [];
  const chunks: [string, Event[]][][] = chunk(eventsByBlock, 500);

  for (const chunk of chunks) {
    res.push(await Promise.all(chunk.map(marshal)));
  }

  return { delta: flatten(res) };
};

export const applyChange = (png: PNG, delta: Delta): void => {
  //  const RGBs = [
  //    0xffffff, 0x000000, 0x3f3f3f, 0x9d9d9d,
  //    0x9d1316, 0xf8d4b3, 0xf19b4b, 0x7e4918,
  //    0xf3e27d, 0x95c888, 0x29701d, 0x90ded9,
  //    0x38a1c1, 0x145694, 0x8d86e2, 0x502eaf
  //  ]

  const RGBs = [
    0xffffff, 0x9f9f9f, 0x000000, 0xdc262a, 0xff9cd2, 0xffd9cd, 0xffa048,
    0x7a3d04, 0xffea6f, 0x84e46c, 0x117a00, 0x92f3ed, 0x00a1d4, 0x005796,
    0xa67cff, 0x6200af,
  ];

  for (const bcs of delta.delta) {
    for (const c of bcs.cs) {
      const idx = c.i * 4;
      const rgb = RGBs[c.c];
      png.data[idx] = (rgb >> 16) & 0xff;
      png.data[idx + 1] = (rgb >> 8) & 0xff;
      png.data[idx + 2] = rgb & 0xff;
      png.data[idx + 3] = 0xff;
    }
  }
};
