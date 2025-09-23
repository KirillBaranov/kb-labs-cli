import type { Command } from "../../types";

export const version: Command = {
  name: "version",
  describe: "Show CLI version",
  run(ctx) {
    const v = ctx?.cliVersion ?? ctx?.env?.CLI_VERSION ?? "0.0.0";
    ctx.presenter.write(String(v));
  },
};