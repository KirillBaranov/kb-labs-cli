import type { Command } from "../../types";

export const hello: Command = {
  name: "hello",
  describe: "Print a friendly greeting",
  async run(ctx) {
    const who = ctx?.user ?? "KB Labs";
    ctx.presenter.write(`Hello, ${who}!`);
  },
};
