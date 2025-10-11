import type { Command } from "../../types";
import { apply } from "@kb-labs/devlink-core";
import { readLastPlan, readPlanFromStdin, formatSummary, type ResultSummary } from "./helpers.js";

export const devlinkApply: Command = {
  name: "devlink:apply",
  describe: "Apply DevLink plan",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      "dry-run": false,
      json: false,
      "from-stdin": false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { "dry-run": dryRun, json, "from-stdin": fromStdin } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Read plan from stdin or last-plan.json
      let plan: any;
      if (fromStdin) {
        plan = await readPlanFromStdin();
      } else {
        plan = await readLastPlan(rootDir);
      }

      // Apply the plan
      const startTime = Date.now();
      const result = await apply(plan, { dryRun: dryRun as boolean });
      const duration = Date.now() - startTime;

      // Calculate summary
      const summary: ResultSummary = {
        executed: result.results?.filter((r: any) => r.status === "executed" || r.status === "success").length || 0,
        skipped: result.results?.filter((r: any) => r.status === "skipped").length || 0,
        errors: result.results?.filter((r: any) => r.status === "error" || r.status === "failed").length || 0,
      };

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          dryRun,
          summary,
          results: result.results,
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        if (dryRun) {
          ctx.presenter.write("🔍 DevLink Apply (Dry Run)\n");
        } else {
          ctx.presenter.write("⚡ DevLink Apply\n");
        }
        ctx.presenter.write("=====================\n");

        if (result.results && result.results.length > 0) {
          ctx.presenter.write("\nOperations:\n");
          for (const item of result.results) {
            const status = item.status === "executed" || item.status === "success" ? "✓" :
              item.status === "skipped" ? "⊘" : "✗";
            const target = item.target || item.package || "N/A";
            const action = item.action || item.kind || "N/A";
            ctx.presenter.write(`  ${status} ${target}: ${action}\n`);

            if (item.error) {
              ctx.presenter.write(`     Error: ${item.error}\n`);
            }
          }
        } else {
          ctx.presenter.write("\nNo operations to apply.\n");
        }

        ctx.presenter.write(formatSummary(summary));
        ctx.presenter.write(`⏱️  Duration: ${duration}ms\n`);

        if (dryRun) {
          ctx.presenter.write("\n💡 This was a dry run. Use without --dry-run to apply changes.\n");
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
            code: error.code || "APPLY_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
      } else {
        ctx.presenter.error("❌ Apply failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  },
};

