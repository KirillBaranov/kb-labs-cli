import type { Command } from "../../types";
import { freeze } from "@kb-labs/devlink-core";
import { readLastPlan, getLockFilePath } from "./helpers";

export const devlinkFreeze: Command = {
  name: "devlink:freeze",
  describe: "Freeze DevLink plan to lock file",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      pin: "caret",
      "lock-file": undefined,
      json: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { pin, "lock-file": lockFileFlag, json } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Validate pin option
      const validPinModes = ["exact", "caret"];
      if (!validPinModes.includes(pin as string)) {
        throw new Error(`Invalid pin mode: ${pin}. Must be one of: ${validPinModes.join(", ")}`);
      }

      // Read last plan
      const plan = await readLastPlan(rootDir);

      // Freeze the plan
      const startTime = Date.now();
      const result = await freeze(plan, {
        lockFile: lockFileFlag as string | undefined,
        pin: pin as "exact" | "caret",
      });
      const duration = Date.now() - startTime;

      // Get lock file path
      const lockFilePath = result.lockFile || getLockFilePath(rootDir, lockFileFlag as string | undefined);

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          lockFile: lockFilePath,
          pin,
          timings: {
            duration,
          },
          meta: result.meta || {},
        });
      } else {
        // Human-readable output
        ctx.presenter.write("🔒 DevLink Freeze\n");
        ctx.presenter.write("=================\n\n");

        ctx.presenter.write(`✓ Lock file created: ${lockFilePath}\n`);
        ctx.presenter.write(`  Pin mode: ${pin}\n`);

        if (result.meta?.itemsCount !== undefined) {
          ctx.presenter.write(`  Items locked: ${result.meta.itemsCount}\n`);
        }

        ctx.presenter.write(`\n⏱️  Duration: ${duration}ms\n`);
      }

      return result.ok ? 0 : 1;
    } catch (error: any) {
      if (json) {
        ctx.presenter.json({
          ok: false,
          error: {
            message: error.message,
            code: error.code || "FREEZE_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
      } else {
        ctx.presenter.error("❌ Freeze failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  },
};

