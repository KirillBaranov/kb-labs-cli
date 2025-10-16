import type { Command } from "../../types";
import { applyLockFile } from "@kb-labs/devlink-core";
import { getLockFilePath, formatSummary, formatFooter, formatCancelledFooter, formatPreflightDiagnostics, type ResultSummary } from "./helpers";
import { colors, createLoader } from "@kb-labs/cli-core";

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

      // Create loader for long operations
      const loader = createLoader({
        enabled: !json && !ctx.presenter.isQuiet && ctx.presenter.isTTY
      });

      // Apply lock file
      const startTime = Date.now();
      let result;

      try {
        if (!json && !ctx.presenter.isQuiet && ctx.presenter.isTTY) {
          loader.start("Applying lock file...");
        }

        result = await applyLockFile({
          rootDir,
          dryRun: dryRun as boolean,
          yes: yes as boolean,
        });

        if (!json && !ctx.presenter.isQuiet && ctx.presenter.isTTY) {
          loader.stop(result.ok, `Completed in ${Date.now() - startTime}ms`);
        }
      } catch (error) {
        if (!json && !ctx.presenter.isQuiet && ctx.presenter.isTTY) {
          loader.stop(false, "Failed");
        }
        throw error;
      }

      const duration = Date.now() - startTime;

      // Calculate summary from new result structure (defensive checks)
      const executed = result.executed || [];
      const diagnostics = result.diagnostics || [];
      const warnings = result.warnings || [];

      // Check if operation was cancelled due to preflight
      const wasCancelled = diagnostics.some((d: string) =>
        d.toLowerCase().includes('cancelled') || d.toLowerCase().includes('uncommitted')
      );

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
          ctx.presenter.write(colors.cyan(colors.bold("🔍 DevLink Lock Apply (Dry Run)")) + "\n");
        } else {
          ctx.presenter.write(colors.cyan(colors.bold("🔒 DevLink Lock Apply")) + "\n");
        }
        ctx.presenter.write(colors.dim("=========================") + "\n");

        ctx.presenter.write(`\n${colors.cyan('📁 Root:')} ${colors.dim(rootDir)}\n`);

        // Display executed items
        if (executed.length > 0) {
          ctx.presenter.write("\n" + colors.bold("Executed:") + "\n");
          for (const item of executed) {
            ctx.presenter.write(`  ${colors.green('✓')} ${item}\n`);
          }
        }

        // Display diagnostics if present with enhanced formatting
        if (diagnostics.length > 0) {
          const wasCancelled = diagnostics.some((d: string) =>
            d.toLowerCase().includes('cancelled') || d.toLowerCase().includes('uncommitted')
          );
          const wasForced = yes as boolean;
          ctx.presenter.write(formatPreflightDiagnostics(diagnostics, wasCancelled, wasForced));
        }

        // Display warnings if present
        if (warnings.length > 0) {
          ctx.presenter.write("\n" + colors.yellow("Warnings:") + "\n");
          for (const warn of warnings) {
            ctx.presenter.write(`  ${colors.yellow('⚠')} ${colors.dim(warn)}\n`);
          }
        }

        if (executed.length === 0 && diagnostics.length === 0) {
          ctx.presenter.write("\nNo operations to apply.\n");
        }

        ctx.presenter.write(formatSummary(summary));

        // Add appropriate footer
        if (wasCancelled) {
          ctx.presenter.write(formatCancelledFooter(duration));
        } else {
          const hasWarnings = warnings.length > 0;
          ctx.presenter.write(formatFooter(summary, duration, hasWarnings));
        }

        if (dryRun) {
          ctx.presenter.write(colors.dim("\n💡 This was a dry run. Use without --dry-run to apply changes.") + "\n");
        }
      }

      // Exit codes: 0 if ok and no errors, 2 if cancelled, 1 if errors
      if (!result.ok || summary.errors > 0) {
        return 1;
      }
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

