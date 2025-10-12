import type { Command } from "../../types";
import { undo } from "@kb-labs/devlink-core";
import type { ResultSummary } from "./helpers";

export const devlinkUndo: Command = {
  name: "devlink:undo",
  describe: "Undo DevLink operations",

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
      const result = await undo({
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
          ctx.presenter.write("🔍 DevLink Undo (Dry Run)\n");
        } else {
          ctx.presenter.write("↩️  DevLink Undo\n");
        }
        ctx.presenter.write("===================\n");

        // Show reverted count
        if (result.reverted > 0) {
          ctx.presenter.write(`\n✓ Reverted ${result.reverted} operation(s)\n`);
        } else {
          ctx.presenter.write("\nNo operations to undo.\n");
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

        ctx.presenter.write(`\n⏱️  Duration: ${duration}ms\n`);

        if (dryRun) {
          ctx.presenter.write("\n💡 This was a dry run. Use without --dry-run to undo changes.\n");
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

