import type { Command } from "../../types";

export const hello: Command = {
  name: "hello",
  category: "system",
  describe: "Print a friendly greeting",
  longDescription: "Prints a simple greeting message for testing CLI functionality",
  examples: [
    "kb hello"
  ],
  async run(ctx, argv, flags) {
    const who = ctx?.user ?? "KB Labs";
    const message = `Hello, ${who}!`;

    if (flags.json) {
      // Простая команда - возвращаем payload, CLI обернет
      return { message };
    } else {
      ctx.presenter.write(message);
      return 0;
    }
  },
};
