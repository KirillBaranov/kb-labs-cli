import type { Command } from "../../types";
import { undo as undoOperations } from "@kb-labs/devlink-core";
import { formatFooter, formatPreflightDiagnostics, type ResultSummary } from "./helpers";
import { colors } from "@kb-labs/cli-core";

export const undo: Command = {
  name: "undo",
  category: "devlink",
  describe: "Undo DevLink operations",
  longDescription: "Reverts previously applied DevLink operations to restore original state",
  aliases: ["devlink:undo"],
  flags: [
    { name: "dry-run", type: "boolean", description: "Show what would be undone without making changes" },
    { name: "json", type: "boolean", description: "Output in JSON format" },
    { name: "yes", type: "boolean", description: "Skip confirmation prompts" }
  ],
  examples: [
    "kb devlink undo",
    "kb devlink undo --dry-run",
    "kb devlink undo --yes"
  ],

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

      // Call undo with required rootDir
      const startTime = Date.now();
      const result = await undoOperations({
        rootDir,
        dryRun: dryRun as boolean,
        yes: yes as boolean,
      });
      const duration = Date.now() - startTime;

      // Calculate summary from new result structure (defensive checks)
      const diagnostics = result.diagnostics || [];
      const warnings = result.warnings || [];

      const summary: ResultSummary = {
        executed: result.reverted || 0,
        skipped: 0,
        errors: diagnostics.filter(d => !d.toLowerCase().includes("operation cancelled")).length,
      };

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          dryRun,
          reverted: result.reverted,
          diagnostics,
          warnings,
          meta: {
            revertedCount: result.reverted,
          },
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        if (dryRun) {
          ctx.presenter.write(colors.cyan(colors.bold("🔍 DevLink Undo (Dry Run)")) + "\n");
        } else {
          ctx.presenter.write(colors.cyan(colors.bold("↩️  DevLink Undo")) + "\n");
        }
        ctx.presenter.write(colors.dim("===================") + "\n");

        // Show reverted count
        if (result.reverted > 0) {
          ctx.presenter.write(`\n${colors.green('✓')} Reverted ${result.reverted} operation(s)\n`);
        } else {
          ctx.presenter.write("\nNo operations to undo.\n");
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

        // Add footer
        const hasWarnings = warnings.length > 0 || diagnostics.some((d: string) =>
          d.toLowerCase().includes('cancelled') || d.toLowerCase().includes('uncommitted')
        );
        ctx.presenter.write(formatFooter(summary, duration, hasWarnings));

        if (dryRun) {
          ctx.presenter.write(colors.dim("\n💡 This was a dry run. Use without --dry-run to undo changes.") + "\n");
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
            code: error.code || "UNDO_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
      } else {
        ctx.presenter.error("❌ Undo failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  },
};

