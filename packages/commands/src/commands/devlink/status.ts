import type { Command } from "../../types";
import { status as getStatus } from "@kb-labs/devlink-core";
import { colors } from "@kb-labs/cli-core";
import type { StatusReport } from "@kb-labs/devlink-core";

// Mode insights
const MODE_INSIGHTS: Record<string, string> = {
  local: "Deps linked via `link:`; edits propagate instantly",
  yalc: "Using yalc for local development; run `yalc publish` after changes",
  workspace: "Using workspace protocol; managed by package manager",
  remote: "Using published versions from registries",
  auto: "Automatic mode selection based on context",
  unknown: "Mode not determined; run `kb devlink plan` first",
};

/**
 * Format age (e.g., "15m ago")
 */
function formatAge(ageMs: number | null): string {
  if (!ageMs) return "unknown";
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Format short mode for --short output
 */
function formatShortReport(report: StatusReport): string {
  const { context, diff } = report;
  const { summary } = diff;
  
  const modeStr = `mode=${context.mode}`;
  const opStr = context.lastOperation !== "none" 
    ? `op=${context.lastOperation}(${formatAge(context.lastOperationAgeMs)})`
    : "op=none";
  const diffStr = `diff:+${summary.added}~${summary.mismatched}-${summary.removed}`;
  const undoStr = `undo=${context.undo.available ? "yes" : "no"}`;

  return `${modeStr} ${opStr} ${diffStr} ${undoStr}`;
}

/**
 * Format human-readable output
 */
function formatHumanReport(report: StatusReport, ctx: any): void {
  const { context, lock, diff, warnings, suggestions } = report;

  // Header
  ctx.presenter.write(colors.cyan(colors.bold("📊 DevLink Status")) + colors.dim(` (root: ${context.rootDir})`) + "\n\n");

  // Context section
  ctx.presenter.write(colors.bold("🧭 Context") + "\n");
  
  const modeLabel = context.mode + (context.modeSource !== "plan" ? ` via ${context.modeSource}` : " via plan");
  ctx.presenter.write(`  Mode:           ${colors.cyan(modeLabel)}\n`);
  
  if (context.lastOperation !== "none") {
    const opAge = formatAge(context.lastOperationAgeMs);
    ctx.presenter.write(`  Last operation: ${colors.cyan(context.lastOperation)}  ${colors.dim("•")}  ${opAge}\n`);
  } else {
    ctx.presenter.write(`  Last operation: ${colors.dim("none")}\n`);
  }
  
  if (context.undo.available) {
    ctx.presenter.write(`  Undo available: ${colors.green("yes")}    ${colors.dim("→")}  ${colors.dim("kb devlink undo")}\n`);
    if (context.undo.backupTs) {
      ctx.presenter.write(`  Backup:         ${colors.dim(context.undo.backupTs)}\n`);
    }
  } else {
    const reason = context.undo.reason ? ` (${context.undo.reason})` : "";
    ctx.presenter.write(`  Undo available: ${colors.dim("no")}${colors.dim(reason)}\n`);
  }

  // Lock section
  ctx.presenter.write("\n" + colors.bold("🔒 Lock") + "\n");
  if (lock.exists) {
    const sourcesStr = Object.entries(lock.sources)
      .filter(([, count]) => count > 0)
      .map(([source, count]) => `${source} ${count}`)
      .join(colors.dim(" • "));
    
    ctx.presenter.write(`  Consumers: ${colors.cyan(lock.consumers.toString())}   Deps: ${colors.cyan(lock.deps.toString())}   Sources: ${sourcesStr}\n`);
    
    if (lock.generatedAt) {
      const lockAge = Date.now() - new Date(lock.generatedAt).getTime();
      ctx.presenter.write(`  Generated:     ${formatAge(lockAge)}\n`);
    }
  } else {
    ctx.presenter.write(`  ${colors.dim("No lock file found")}\n`);
  }

  // Snapshot section (diff)
  ctx.presenter.write("\n" + colors.bold("📦 Snapshot (lock vs manifests)") + "\n");
  
  const consumerNames = Object.keys(diff.byConsumer);
  if (consumerNames.length === 0) {
    ctx.presenter.write(`  ${colors.dim("No differences found")}\n`);
  } else {
    const maxDisplay = 10;
    const displayConsumers = consumerNames.slice(0, maxDisplay);
    
    for (const consumerName of displayConsumers) {
      const consumerDiff = diff.byConsumer[consumerName];
      if (!consumerDiff) continue;
      
      const totalChanges = 
        consumerDiff.added.length +
        consumerDiff.updated.length +
        consumerDiff.removed.length +
        consumerDiff.mismatched.length;
      
      ctx.presenter.write(`  ${colors.cyan(consumerName)} ${colors.dim(`(${totalChanges} changes)`)}\n`);
      
      // Show a few examples
      const maxEntries = 5;
      let shown = 0;
      
      // Mismatched (most important) - show as "old → new" with colors
      for (const entry of consumerDiff.mismatched.slice(0, maxEntries - shown)) {
        const sectionLabel = entry.section === "dependencies" ? "dep" : entry.section === "devDependencies" ? "dev" : "peer";
        const oldValue = colors.red(entry.lock || "");
        const arrow = colors.dim(" → ");
        const newValue = colors.green(entry.manifest || "");
        ctx.presenter.write(`    ⚠  ${entry.name} ${colors.dim(`[${sectionLabel}]`)}\n`);
        ctx.presenter.write(`       ${oldValue}${arrow}${newValue}\n`);
        shown++;
      }
      
      // Added - show as "+ new" in green
      for (const entry of consumerDiff.added.slice(0, maxEntries - shown)) {
        const sectionLabel = entry.section === "dependencies" ? "dep" : entry.section === "devDependencies" ? "dev" : "peer";
        const newValue = colors.green(entry.to || "");
        ctx.presenter.write(`    ➕ ${entry.name} ${colors.dim(`[${sectionLabel}]`)}\n`);
        ctx.presenter.write(`       ${colors.dim("(not in lock)")} ${colors.dim("→")} ${newValue}\n`);
        shown++;
      }
      
      // Removed - show as "- old" in red
      for (const entry of consumerDiff.removed.slice(0, maxEntries - shown)) {
        const sectionLabel = entry.section === "dependencies" ? "dep" : entry.section === "devDependencies" ? "dev" : "peer";
        const oldValue = colors.red(entry.from || "");
        ctx.presenter.write(`    ➖ ${entry.name} ${colors.dim(`[${sectionLabel}]`)}\n`);
        ctx.presenter.write(`       ${oldValue} ${colors.dim("→ (removed)")}\n`);
        shown++;
      }
      
      const remaining = totalChanges - shown;
      if (remaining > 0) {
        ctx.presenter.write(`    ${colors.dim(`... +${remaining} more`)}\n`);
      }
    }
    
    if (consumerNames.length > maxDisplay) {
      ctx.presenter.write(`  ${colors.dim(`... +${consumerNames.length - maxDisplay} more consumers`)}\n`);
    }
  }

  // Summary
  const { summary } = diff;
  if (summary.added + summary.updated + summary.removed + summary.mismatched > 0) {
    ctx.presenter.write(`\n${colors.dim("Δ Summary:")} added ${summary.added} ${colors.dim("•")} updated ${summary.updated} ${colors.dim("•")} removed ${summary.removed} ${colors.dim("•")} mismatched ${summary.mismatched}\n`);
  }

  // Mode insight
  const insight = MODE_INSIGHTS[context.mode];
  if (insight) {
    ctx.presenter.write("\n" + colors.bold("🧩 Mode insight") + "\n");
    ctx.presenter.write(`  ${colors.dim(insight)}\n`);
  }

  // Warnings
  if (warnings.length > 0) {
    ctx.presenter.write("\n" + colors.bold("⚠️  Warnings") + ` ${colors.dim(`(${warnings.length})`)}\n`);
    for (const warning of warnings.slice(0, 10)) {
      const icon = warning.severity === "error" ? "❌" : warning.severity === "warn" ? "⚠" : "ℹ";
      const severityColor = warning.severity === "error" ? colors.red : warning.severity === "warn" ? colors.yellow : colors.dim;
      ctx.presenter.write(`  ${icon} [${severityColor(warning.severity.toUpperCase())}] ${warning.code}: ${warning.message}\n`);
      
      if (warning.examples && warning.examples.length > 0) {
        ctx.presenter.write(`    ${colors.dim("Examples:")} ${warning.examples.slice(0, 3).join(", ")}\n`);
      }
    }
  }

  // Suggestions
  if (suggestions.length > 0) {
    ctx.presenter.write("\n" + colors.bold("💡 Next actions") + "\n");
    for (const suggestion of suggestions.slice(0, 5)) {
      const cmd = `${suggestion.command} ${suggestion.args.join(" ")}`.trim();
      const impactLabel = suggestion.impact === "safe" ? colors.green("[safe]") : colors.yellow("[disruptive]");
      ctx.presenter.write(`  • ${suggestion.description}: ${colors.cyan(cmd)}  ${impactLabel}\n`);
    }
  }

  // Timings
  ctx.presenter.write(`\n${colors.dim("⏱️  Completed in")} ${report.timings.total}ms ${colors.dim(`(readFs:${report.timings.readFs} diff:${report.timings.diff} warnings:${report.timings.warnings})`)}\n`);
}

export const status: Command = {
  name: "status",
  category: "devlink",
  describe: "Show DevLink status",
  longDescription: "Displays comprehensive DevLink status including mode, lock stats, manifest diff, health warnings, and suggestions",
  aliases: ["devlink:status"],
  flags: [
    { name: "json", type: "boolean", description: "Output in JSON format" },
    { name: "short", type: "boolean", description: "Compact one-line output" },
    { name: "consumer", type: "string", description: "Filter by consumer name/glob" },
    { name: "warnings", type: "string", description: "Warning level: all|warn|error|none", choices: ["all", "warn", "error", "none"] },
    { name: "ci", type: "boolean", description: "CI mode: machine-friendly output + exit code from severity" },
    { name: "roots", type: "string", description: "Comma-separated workspace roots" },
  ],
  examples: [
    "kb devlink status",
    "kb devlink status --json",
    "kb devlink status --short",
    "kb devlink status --consumer @kb-labs/cli",
    "kb devlink status --warnings warn",
    "kb devlink status --ci",
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      json: false,
      short: false,
      consumer: undefined,
      warnings: "all",
      ci: false,
      roots: undefined,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { json, short, consumer, warnings: warningLevel, ci } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Get status
      const report = await getStatus({
        rootDir,
        consumer: consumer as string | undefined,
        warningLevel: warningLevel as "all" | "warn" | "error" | "none",
      });

      // Output based on format
      if (json) {
        ctx.presenter.json(report);
        ctx.sentJSON = true;
      } else if (short) {
        ctx.presenter.write(formatShortReport(report) + "\n");
      } else {
        formatHumanReport(report, ctx);
      }

      // CI mode: exit with code 2 if error-level warnings
      if (ci) {
        const hasErrors = report.warnings.some((w) => w.severity === "error");
        if (hasErrors) {
          return 2;
        }
      }

      return 0;
    } catch (error: any) {
      if (json || ci) {
        ctx.presenter.json({
          ok: false,
          error: {
            message: error.message,
            code: error.code || "STATUS_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
        ctx.sentJSON = true;
      } else {
        ctx.presenter.error("❌ Status check failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  },
};

