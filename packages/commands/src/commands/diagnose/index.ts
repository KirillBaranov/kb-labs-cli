import type { Command } from "../../types";

export const diagnose: Command = {
  name: "diagnose",
  describe: "Quick environment & repo diagnosis",
  async run(ctx) {
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    ctx.presenter.write(`node=${process.version}`);
    ctx.presenter.write(`repoRoot=${repoRoot}`);
    if (ctx?.logger?.info) {
      ctx.logger.info("[diagnose] ok");
    }
  },
};
