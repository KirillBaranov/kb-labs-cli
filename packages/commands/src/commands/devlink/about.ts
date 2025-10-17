import type { Command } from "../../types";
import { colors } from "@kb-labs/cli-core";

export const about: Command = {
  name: "about",
  category: "devlink",
  describe: "Show information about DevLink",
  longDescription: "Displays version and information about the DevLink tool",
  aliases: ["devlink:about"],
  examples: [
    "kb devlink about"
  ],

  async run(ctx) {
    try {
      // Read version from package.json
      let version = "0.1.0-beta";
      try {
        const { readFileSync } = await import("fs");
        const packageJsonPath = new URL("../../../../package.json", import.meta.url);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        version = packageJson.version || version;
      } catch {
        // Fallback to default version
      }

      // About output (no JSON mode for this command)
      ctx.presenter.write(colors.cyan(colors.bold("💫 KB Labs DevLink")) + " " + colors.green(`v${version}`) + "\n");
      ctx.presenter.write(colors.gray("A workspace orchestrator for smart linking.") + "\n");
      ctx.presenter.write(colors.gray("Made with ❤️  by Kirill Baranov | KB Labs") + "\n");

      return 0;
    } catch (error: any) {
      ctx.presenter.error(colors.red("❌ About command failed\n"));
      ctx.presenter.error(colors.red(`   Error: ${error.message}\n`));
      return 1;
    }
  },
};
