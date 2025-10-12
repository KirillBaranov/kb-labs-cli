import type { Command } from "../../types";
import { applyLockFile } from "@kb-labs/devlink-core";
import { getLockFilePath, formatSummary, type ResultSummary } from "./helpers";

export const devlinkLockApply: Command = {
  name: "devlink:lock:apply",
  describe: "Apply DevLink lock file",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      "dry-run": false,
      json: false,
      yes: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { "dry-run": dryRun, json, yes } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Apply lock file
      const startTime = Date.now();
      const result = await applyLockFile({
        rootDir,
        dryRun: dryRun as boolean,
        yes: yes as boolean,
      });
      const duration = Date.now() - startTime;

      // Calculate summary from new result structure (defensive checks)
      const executed = result.executed || [];
      const diagnostics = result.diagnostics || [];
      const warnings = result.warnings || [];

      const summary: ResultSummary = {
        executed: executed.length,
        skipped: 0,  // Not provided separately in new API
        errors: diagnostics.length,
      };

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          dryRun,
          summary,
          executed,
          diagnostics,
          warnings,
          meta: {
            rootDir,
            executedCount: summary.executed,
          },
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        if (dryRun) {
          ctx.presenter.write("🔍 DevLink Lock Apply (Dry Run)\n");
        } else {
          ctx.presenter.write("🔒 DevLink Lock Apply\n");
        }
        ctx.presenter.write("=========================\n");

        ctx.presenter.write(`\n📁 Root: ${rootDir}\n`);

        // Display executed items
        if (executed.length > 0) {
          ctx.presenter.write("\nExecuted:\n");
          for (const item of executed) {
            ctx.presenter.write(`  ✓ ${item}\n`);
          }
        }

        // Display diagnostics if present
        if (diagnostics.length > 0) {
          ctx.presenter.write("\nDiagnostics:\n");
          for (const diag of diagnostics) {
            ctx.presenter.write(`  ! ${diag}\n`);
          }
        }

        // Display warnings if present
        if (warnings.length > 0) {
          ctx.presenter.write("\nWarnings:\n");
          for (const warn of warnings) {
            ctx.presenter.write(`  ⚠ ${warn}\n`);
          }
        }

        if (executed.length === 0 && diagnostics.length === 0) {
          ctx.presenter.write("\nNo operations to apply.\n");
        }

        ctx.presenter.write(formatSummary(summary));
        ctx.presenter.write(`⏱️  Duration: ${duration}ms\n`);

        if (dryRun) {
          ctx.presenter.write("\n💡 This was a dry run. Use without --dry-run to apply changes.\n");
        }
      }

      // Exit codes: 0 if ok and no errors, 2 if cancelled, 1 if errors
      if (!result.ok || summary.errors > 0) {
        return 1;
      }
      // Check if operation was cancelled due to preflight
      const wasCancelled = diagnostics.some((d: string) =>
        d.toLowerCase().includes('cancelled') || d.toLowerCase().includes('uncommitted')
      );
      if (wasCancelled) {
        return 2;
      }
      return 0;
    } catch (error: any) {
      if (json) {
        ctx.presenter.json({
          ok: false,
          error: {
            message: error.message,
            code: error.code || "LOCK_APPLY_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
      } else {
        ctx.presenter.error("❌ Lock apply failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  },
};

