import type { Command } from "../../types";
import { scanAndPlan } from "@kb-labs/devlink-core";
import { writeLastPlan, printTable } from "./helpers.js";

export const devlinkPlan: Command = {
  name: "devlink:plan",
  describe: "Scan and plan DevLink operations",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      mode: "local",
      policy: undefined,
      json: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { mode, policy, json } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Validate mode
      const validModes = ["local", "workspace", "auto"];
      if (!validModes.includes(mode as string)) {
        throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(", ")}`);
      }

      // Call scanAndPlan
      const startTime = Date.now();
      const result = await scanAndPlan({
        rootDir,
        mode: mode as "local" | "workspace" | "auto",
        policy: policy as string | undefined,
      });
      const duration = Date.now() - startTime;

      // Save plan to last-plan.json
      const planPath = await writeLastPlan(result, rootDir);

      // Check for cycles
      const hasCycles = result.plan?.cycles && result.plan.cycles.length > 0;
      const hasWarnings = hasCycles;

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          plan: result.plan,
          timings: {
            duration,
            scanDuration: result.timings?.scanDuration,
            planDuration: result.timings?.planDuration,
          },
          meta: {
            planPath,
            mode,
            policy: policy || null,
          },
          ...(hasCycles && {
            warnings: result.plan.cycles.map((cycle: any) => ({
              type: "cycle",
              message: `Dependency cycle detected: ${cycle.path?.join(" → ") || "unknown"}`,
              cycle,
            })),
          }),
        });
      } else {
        // Human-readable output
        ctx.presenter.write("🔍 DevLink Plan\n");
        ctx.presenter.write("===============\n\n");

        if (result.plan?.items && result.plan.items.length > 0) {
          // Convert plan items to table rows
          const rows = result.plan.items.map((item: any) => ({
            target: item.target || "N/A",
            dep: item.dependency || item.dep || "N/A",
            kind: item.kind || item.type || "N/A",
            reason: item.reason || item.why || "N/A",
          }));

          ctx.presenter.write(printTable(rows));
          ctx.presenter.write(`\nTotal items: ${result.plan.items.length}\n`);
        } else {
          ctx.presenter.write("No operations planned.\n");
        }

        // Show cycles warning
        if (hasCycles) {
          ctx.presenter.write("\n⚠️  Warning: Dependency cycles detected:\n");
          for (const cycle of result.plan.cycles) {
            const path = cycle.path?.join(" → ") || "unknown";
            ctx.presenter.write(`   • ${path}\n`);
          }
        }

        ctx.presenter.write(`\n📁 Plan saved to: ${planPath}\n`);
        ctx.presenter.write(`⏱️  Duration: ${duration}ms\n`);
      }

      // Exit codes: 0 if ok, 2 if warnings, 1 if errors
      if (!result.ok) {
        return 1;
      }
      if (hasWarnings) {
        return 2;
      }
      return 0;
    } catch (error: any) {
      if (json) {
        ctx.presenter.json({
          ok: false,
          error: {
            message: error.message,
            code: error.code || "PLAN_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
      } else {
        ctx.presenter.error("❌ Plan failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  },
};

