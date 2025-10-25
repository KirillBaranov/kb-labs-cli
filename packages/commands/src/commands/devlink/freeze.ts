import type { Command } from "../../types";
import { freeze as freezePlan } from "@kb-labs/devlink-core";
import { readLastPlan, getLockFilePath, formatFooter } from "./helpers";
import { colors } from "@kb-labs/cli-core";

export const freeze: Command = {
  name: "freeze",
  category: "devlink",
  describe: "Freeze DevLink plan to lock file",
  longDescription: "Creates a lock file from the current DevLink plan to ensure reproducible builds",
  flags: [
    { name: "pin", type: "string", choices: ["exact", "caret"], default: "caret", description: "Version pinning strategy" },
    { name: "dry-run", type: "boolean", description: "Show what would be frozen without making changes" },
    { name: "replace", type: "boolean", description: "Replace entire lock file instead of merging" },
    { name: "prune", type: "boolean", description: "Remove lock entries not in current plan" },
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: [
    "kb devlink freeze",
    "kb devlink freeze --pin=exact",
    "kb devlink freeze --json"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      pin: "caret",
      json: false,
      "dry-run": false,
      replace: false,
      prune: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { pin, json, "dry-run": dryRun, replace, prune } = finalFlags;

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
      const result = await freezePlan(plan, {
        cwd: rootDir,
        pin: pin as "exact" | "caret",
        dryRun: dryRun as boolean,
        replace: replace as boolean,
        prune: prune as boolean,
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
        ctx.sentJSON = true;  // NEW: помечаем что JSON уже отправлен
      } else {
        // Human-readable output
        ctx.presenter.write(colors.cyan(colors.bold("🔒 DevLink Freeze")) + "\n");
        ctx.presenter.write(colors.dim("=================") + "\n\n");

        ctx.presenter.write(`${colors.green('✓')} Lock file created\n`);
        ctx.presenter.write(`  ${colors.cyan('Path:')} ${colors.dim(lockFilePath)}\n`);
        ctx.presenter.write(`  ${colors.cyan('Pin mode:')} ${colors.dim(pin)}\n`);

        // Count frozen packages from plan if available
        if (plan?.actions) {
          const frozenCount = plan.actions.length;
          ctx.presenter.write(`  ${colors.cyan('Frozen packages:')} ${frozenCount}\n`);
        } else if (result.meta?.packagesCount !== undefined) {
          ctx.presenter.write(`  ${colors.cyan('Frozen packages:')} ${result.meta.packagesCount}\n`);
        }

        // Display diagnostics if present
        if (result.diagnostics && result.diagnostics.length > 0) {
          ctx.presenter.write(`\n${colors.yellow('⚠️  Diagnostics:')}\n`);
          for (const diag of result.diagnostics) {
            ctx.presenter.write(`   • ${colors.dim(diag)}\n`);
          }
        }

        // Add footer
        const summary = { executed: plan?.actions?.length || result.meta?.packagesCount || 0, skipped: 0, errors: 0 };
        const hasWarnings = result.diagnostics && result.diagnostics.length > 0;
        ctx.presenter.write(formatFooter(summary, duration, hasWarnings));
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

