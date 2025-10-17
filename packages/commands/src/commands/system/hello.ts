import type { Command } from "../../types";

export const hello: Command = {
  name: "hello",
  category: "system",
  describe: "Print a friendly greeting",
  longDescription: "Prints a simple greeting message for testing CLI functionality",
  examples: [
    "kb hello"
  ],
  async run(ctx) {
    const who = ctx?.user ?? "KB Labs";
    ctx.presenter.write(`Hello, ${who}!`);
  },
};
