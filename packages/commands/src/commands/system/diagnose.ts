import type { Command } from "../../types";

export const diagnose: Command = {
  name: "diagnose",
  category: "system",
  describe: "Quick environment & repo diagnosis",
  longDescription: "Performs a quick diagnosis of the current environment and repository state",
  examples: [
    "kb diagnose"
  ],
  async run(ctx, argv, flags) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    const nodeVersion = process.version;

    if (flags.json) {
      return {
        node: nodeVersion,
        repoRoot,
      };
    } else {
      ctx.presenter.write(`node=${nodeVersion}`);
      ctx.presenter.write(`repoRoot=${repoRoot}`);
      if (ctx?.logger?.info) {
        ctx.logger.info("[diagnose] ok");
      }
      return 0;
    }
  },
};
