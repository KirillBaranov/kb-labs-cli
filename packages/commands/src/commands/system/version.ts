import type { Command } from "../../types";

export const version: Command = {
  name: "version",
  category: "system",
  describe: "Show CLI version",
  longDescription: "Displays the current version of the KB Labs CLI",
  examples: [
    "kb version"
  ],
  run(ctx, argv, flags) {
    const v = ctx?.cliVersion ?? ctx?.env?.CLI_VERSION ?? "0.0.0";
    const version = String(v);

    if (flags.json) {
      return { version };
    } else {
      ctx.presenter.write(version);
      return 0;
    }
  },
};
