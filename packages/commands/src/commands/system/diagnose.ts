import type { Command } from "../../types";

export const diagnose: Command = {
  name: "diagnose",
  category: "system",
  describe: "Quick environment & repo diagnosis",
  longDescription: "Performs a quick diagnosis of the current environment and repository state",
  examples: [
    "kb diagnose"
  ],
  async run(ctx) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    ctx.presenter.write(`node=${process.version}`);
    ctx.presenter.write(`repoRoot=${repoRoot}`);
    if (ctx?.logger?.info) {
      ctx.logger.info("[diagnose] ok");
    }
  },
};
