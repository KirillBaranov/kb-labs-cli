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
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { "dry-run": dryRun, json } = finalFlags;

    try {
      // Call undo
      const startTime = Date.now();
      const result = await undo({ dryRun: dryRun as boolean });
      const duration = Date.now() - startTime;

      // Calculate summary
      const summary: ResultSummary = {
        executed: result.reverted || result.results?.filter((r: any) => r.status === "reverted" || r.status === "success").length || 0,
        skipped: result.results?.filter((r: any) => r.status === "skipped").length || 0,
        errors: result.results?.filter((r: any) => r.status === "error" || r.status === "failed").length || 0,
      };

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          dryRun,
          summary: {
            reverted: summary.executed,
            skipped: summary.skipped,
            errors: summary.errors,
          },
          results: result.results,
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

        if (result.results && result.results.length > 0) {
          ctx.presenter.write("\nOperations:\n");
          for (const item of result.results) {
            const status = item.status === "reverted" || item.status === "success" ? "✓" :
              item.status === "skipped" ? "⊘" : "✗";
            const target = item.target || item.package || "N/A";
            const action = item.action || "reverted";
            ctx.presenter.write(`  ${status} ${target}: ${action}\n`);

            if (item.error) {
              ctx.presenter.write(`     Error: ${item.error}\n`);
            }
          }
        } else {
          ctx.presenter.write("\nNo operations to undo.\n");
        }

        ctx.presenter.write(`\n📊 Summary:\n`);
        ctx.presenter.write(`  ✓ Reverted: ${summary.executed}\n`);
        ctx.presenter.write(`  ⊘ Skipped:  ${summary.skipped}\n`);
        ctx.presenter.write(`  ✗ Errors:   ${summary.errors}\n`);
        ctx.presenter.write(`⏱️  Duration: ${duration}ms\n`);

        if (dryRun) {
          ctx.presenter.write("\n💡 This was a dry run. Use without --dry-run to undo changes.\n");
        }
      }

      // Exit codes: 0 if ok and no errors, 1 if errors
      if (!result.ok || summary.errors > 0) {
        return 1;
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

