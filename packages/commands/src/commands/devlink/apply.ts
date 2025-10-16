import type { Command } from "../../types";
import { apply } from "@kb-labs/devlink-core";
import { readLastPlan, readPlanFromStdin, formatSummary, formatFooter, formatPreflightDiagnostics, type ResultSummary } from "./helpers.js";
import { colors, createLoader } from "@kb-labs/cli-core";

export const devlinkApply: Command = {
  name: "devlink:apply",
  describe: "Apply DevLink plan",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      "dry-run": false,
      json: false,
      "from-stdin": false,
      "from-file": undefined,
      yes: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { "dry-run": dryRun, json, "from-stdin": fromStdin, "from-file": fromFile, yes } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Read plan from stdin, file, or last-plan.json
      let plan: any;
      if (fromStdin) {
        plan = await readPlanFromStdin();
      } else if (fromFile) {
        const fs = await import('fs/promises');
        const content = await fs.readFile(fromFile as string, 'utf-8');
        plan = JSON.parse(content);
      } else {
        plan = await readLastPlan(rootDir);
      }

      // Create loader for long operations
      const loader = createLoader({
        enabled: !json && !ctx.presenter.isQuiet && ctx.presenter.isTTY
      });

      // Apply the plan
      const startTime = Date.now();
      let result;

      try {
        if (!json && !ctx.presenter.isQuiet && ctx.presenter.isTTY) {
          loader.start("Applying operations...");
        }

        result = await apply(plan, {
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
      const skipped = result.skipped || [];
      const errors = result.errors || [];
      const diagnostics = result.diagnostics || [];
      const warnings = result.warnings || [];

      const summary: ResultSummary = {
        executed: executed.length,
        skipped: skipped.length,
        errors: errors.length,
      };

      // Check for empty plan with diagnostics
      const hasEmptyActions = executed.length === 0 && skipped.length === 0 && errors.length === 0;
      const hasDiagnostics = diagnostics.length > 0;
      const isEmptyPlanWarning = hasEmptyActions && hasDiagnostics;

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          dryRun,
          summary,
          executed,
          skipped,
          errors,
          diagnostics,
          warnings,
          meta: {
            executedCount: summary.executed,
            skippedCount: summary.skipped,
            errorCount: summary.errors,
            ...(isEmptyPlanWarning && { emptyPlan: true }),
          },
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        if (dryRun) {
          ctx.presenter.write(colors.cyan(colors.bold("🔍 DevLink Apply (Dry Run)")) + "\n");
        } else {
          ctx.presenter.write(colors.cyan(colors.bold("⚡ DevLink Apply")) + "\n");
        }
        ctx.presenter.write(colors.dim("=====================") + "\n");

        // Display executed actions grouped by kind
        if (executed.length > 0) {
          // Group by kind for better UX
          const byKind = new Map<string, typeof executed>();
          for (const action of executed) {
            const kind = action.kind || "unknown";
            if (!byKind.has(kind)) {
              byKind.set(kind, []);
            }
            byKind.get(kind)!.push(action);
          }

          ctx.presenter.write("\n" + colors.bold("Executed:") + "\n");
          for (const [kind, actions] of Array.from(byKind.entries()).sort()) {
            ctx.presenter.write(`  ${colors.cyan(kind)} (${actions.length}):\n`);
            for (const action of actions) {
              ctx.presenter.write(`    ${colors.green('✓')} ${action.target}\n`);
            }
          }
        }

        // Display skipped actions
        if (skipped.length > 0) {
          ctx.presenter.write("\n" + colors.bold("Skipped:") + "\n");
          for (const action of skipped) {
            ctx.presenter.write(`  ${colors.yellow('⊘')} ${action.target}: ${colors.dim(action.kind)}\n`);
          }
        }

        // Display errors
        if (errors.length > 0) {
          ctx.presenter.write("\n" + colors.red("Errors:") + "\n");
          for (const err of errors) {
            ctx.presenter.write(`  ${colors.red('✗')} ${err.action.target}: ${colors.dim(err.action.kind)}\n`);
            ctx.presenter.write(`     ${colors.red('Error:')} ${colors.dim(String(err.error))}\n`);
          }
        }

        if (hasEmptyActions) {
          if (isEmptyPlanWarning) {
            ctx.presenter.write("\n" + colors.yellow("⚠️  No operations to apply (diagnostics present).") + "\n");
          } else {
            ctx.presenter.write("\nNo operations to apply.\n");
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

        ctx.presenter.write(formatSummary(summary));

        // Add footer
        const hasWarnings = warnings.length > 0 || diagnostics.some((d: string) =>
          d.toLowerCase().includes('cancelled') || d.toLowerCase().includes('uncommitted')
        );
        ctx.presenter.write(formatFooter(summary, duration, hasWarnings));

        if (dryRun) {
          ctx.presenter.write(colors.dim("\n💡 This was a dry run. Use without --dry-run to apply changes.") + "\n");
        }
      }

      // Exit codes: 0 if ok and no errors, 2 if empty plan/warnings, 1 if errors
      if (!result.ok || summary.errors > 0) {
        return 1;
      }
      // Check if operation was cancelled due to preflight
      const wasCancelled = diagnostics.some((d: string) =>
        d.toLowerCase().includes('cancelled') || d.toLowerCase().includes('uncommitted')
      );
      if (isEmptyPlanWarning || wasCancelled) {
        return 2;
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

