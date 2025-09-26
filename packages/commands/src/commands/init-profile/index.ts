import type { Command } from "../../types";

export const initProfile: Command = {
  name: "init.profile",
  describe: "Scaffold a profile (draft)",
  async run(ctx, argv) {
    const name = argv[0] ?? "frontend";
    ctx.presenter.write(`Initialized profile: ${name} (draft)`);
  },
};
