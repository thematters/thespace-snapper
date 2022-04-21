type Change = {
  i: number;
  c: number;
};

export type BlockChange = {
  bk_num: number;
  time: string;
  cs: Change[];
};

export type Delta = {
  delta: BlockChange[];
};
