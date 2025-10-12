import type { Command } from "../../types";
import { freeze } from "@kb-labs/devlink-core";
import { readLastPlan, getLockFilePath } from "./helpers";

export const devlinkFreeze: Command = {
  name: "devlink:freeze",
  describe: "Freeze DevLink plan to lock file",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      pin: "caret",
      json: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { pin, json } = finalFlags;

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
        cwd: rootDir,
        pin: pin as "exact" | "caret",
      });
      const duration = Date.now() - startTime;

      // Get lock file path from result
      const lockFilePath = result.lockPath;

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          lockFile: lockFilePath,
          pin,
          diagnostics: result.diagnostics,
          meta: {
            lockPath: lockFilePath,
            ...(result.meta || {}),
          },
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        ctx.presenter.write("🔒 DevLink Freeze\n");
        ctx.presenter.write("=================\n\n");

        ctx.presenter.write(`✓ Lock file created\n`);
        ctx.presenter.write(`  Path: ${lockFilePath}\n`);
        ctx.presenter.write(`  Pin mode: ${pin}\n`);

        // Count frozen packages from plan if available
        if (plan?.actions) {
          const frozenCount = plan.actions.length;
          ctx.presenter.write(`  Frozen packages: ${frozenCount}\n`);
        } else if (result.meta?.itemsCount !== undefined) {
          ctx.presenter.write(`  Frozen packages: ${result.meta.itemsCount}\n`);
        }

        // Display diagnostics if present
        if (result.diagnostics && result.diagnostics.length > 0) {
          ctx.presenter.write(`\n⚠️  Diagnostics:\n`);
          for (const diag of result.diagnostics) {
            ctx.presenter.write(`   • ${diag}\n`);
          }
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

