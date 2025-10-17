import type { Command } from "../../types";

export const version: Command = {
  name: "version",
  category: "system",
  describe: "Show CLI version",
  longDescription: "Displays the current version of the KB Labs CLI",
  examples: [
    "kb version"
  ],
  run(ctx) {
    const v = ctx?.cliVersion ?? ctx?.env?.CLI_VERSION ?? "0.0.0";
    ctx.presenter.write(String(v));
  },
};
