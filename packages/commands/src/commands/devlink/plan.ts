import type { Command } from "../../types";
import { scanAndPlan } from "@kb-labs/devlink-core";
import { writeLastPlan, printTable, formatFooter } from "./helpers";
import { colors } from "@kb-labs/cli-core";

export const plan: Command = {
  name: "plan",
  category: "devlink",
  describe: "Scan and plan DevLink operations",
  longDescription: "Scans workspace for packages and creates a linking plan based on dependencies and configuration",
  aliases: ["devlink:plan"],
  flags: [
    { name: "mode", type: "string", choices: ["local", "workspace", "auto"], default: "local", description: "Discovery mode for package resolution" },
    { name: "json", type: "boolean", description: "Output in JSON format" },
    { name: "roots", type: "string", description: "Comma-separated workspace roots" },
    { name: "allow", type: "string", description: "Comma-separated list of allowed packages" },
    { name: "deny", type: "string", description: "Comma-separated list of denied packages" },
    { name: "force-local", type: "string", description: "Comma-separated list of packages to force local resolution" },
    { name: "force-npm", type: "string", description: "Comma-separated list of packages to force npm resolution" },
    { name: "policy", type: "string", description: "Policy file path" }
  ],
  examples: [
    "kb devlink plan",
    "kb devlink plan --mode=workspace",
    "kb devlink plan --roots=/path/to/repo1,/path/to/repo2",
    "kb devlink plan --json"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      mode: "local",
      policy: undefined,
      json: false,
      roots: undefined,
      allow: undefined,
      deny: undefined,
      "force-local": undefined,
      "force-npm": undefined,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { mode, policy, json, roots, allow, deny } = finalFlags;
    const forceLocal = finalFlags["force-local"];
    const forceNpm = finalFlags["force-npm"];

    try {
      const rootDir = process.cwd();

      // Validate mode
      const validModes = ["local", "workspace", "auto"];
      if (!validModes.includes(mode as string)) {
        throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(", ")}`);
      }

      // Parse roots (comma-separated absolute paths)
      let rootsParsed: string[] | undefined;
      if (roots && typeof roots === 'string') {
        const rootsStr = roots as string;
        if (rootsStr.trim()) {
          rootsParsed = rootsStr.split(',').map((r: string) => r.trim()).filter(Boolean);
        }
      }

      // Parse policy flags (CSV → string[])
      const parseCsv = (value: unknown): string[] | undefined => {
        if (!value || typeof value !== 'string') { return undefined; }
        const str = value as string;
        if (!str.trim()) { return undefined; }
        return str.split(',').map((s: string) => s.trim()).filter(Boolean);
      };

      const allowParsed = parseCsv(allow);
      const denyParsed = parseCsv(deny);
      const forceLocalParsed = parseCsv(forceLocal);
      const forceNpmParsed = parseCsv(forceNpm);

      // Build policy object
      const policyObject: any = {};
      if (allowParsed) { policyObject.allow = allowParsed; }
      if (denyParsed) { policyObject.deny = denyParsed; }
      if (forceLocalParsed) { policyObject.forceLocal = forceLocalParsed; }
      if (forceNpmParsed) { policyObject.forceNpm = forceNpmParsed; }

      const hasPolicyFlags = Object.keys(policyObject).length > 0;

      // Call scanAndPlan
      const startTime = Date.now();
      const result = await scanAndPlan({
        rootDir,
        mode: mode as "local" | "workspace" | "auto",
        ...(hasPolicyFlags && { policy: policyObject }),
        ...(rootsParsed && { roots: rootsParsed }),
      });
      const duration = Date.now() - startTime;

      // Save plan to last-plan.json (save just the plan, not the whole result)
      const planPath = await writeLastPlan(result.plan, rootDir);

      // Check for cycles and deny-hits in diagnostics
      const hasCycles = (result.plan?.graph?.cycles && result.plan.graph.cycles.length > 0) ||
        result.diagnostics?.some((d: string) => d.toLowerCase().includes('cycle')) ||
        false;
      const hasDenyHit = result.diagnostics?.some((d: string) =>
        d.toLowerCase().includes('deny') || d.toLowerCase().includes('denied')
      ) || false;
      const hasWarnings = hasCycles || hasDenyHit;

      // Check for empty plan with diagnostics
      const hasEmptyPlan = (!result.plan?.actions || result.plan.actions.length === 0) &&
        (result.diagnostics && result.diagnostics.length > 0);
      const isEmptyPlanWarning = hasEmptyPlan;

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          plan: result.plan,
          timings: result.timings,
          diagnostics: result.diagnostics,
          meta: {
            planPath,
            mode,
            policy: hasPolicyFlags ? policyObject : null,
            ...(rootsParsed && { roots: rootsParsed }),
            ...(hasEmptyPlan && { emptyPlan: true }),
            roots: result.plan?.index?.packages ? Object.keys(result.plan.index.packages).length : 0,
            packages: result.plan?.graph?.nodes?.length || 0,
            actions: result.plan?.actions?.length || 0,
          },
          ...(hasCycles && {
            warnings: (result.plan?.graph?.cycles || []).map((cycle: string[]) => ({
              type: "cycle",
              message: `Dependency cycle detected: ${cycle.join(" → ")}`,
              cycle,
            })),
          }),
        });
      } else {
        // Human-readable output
        ctx.presenter.write(colors.cyan(colors.bold("🔍 DevLink Plan")) + "\n");
        ctx.presenter.write(colors.dim("===============") + "\n\n");

        // Print auto-discovered roots when no --roots flag was used
        if (!rootsParsed && result.plan?.index?.packages) {
          const packages = Object.values(result.plan.index.packages);
          const uniqueRoots = new Set<string>();
          for (const pkg of packages) {
            if (pkg.dir) {
              // Extract repo root (simplified - assumes packages are under a common root)
              const parts = pkg.dir.split('/');
              if (parts.length > 3) {
                uniqueRoots.add(parts.slice(0, parts.length - 2).join('/'));
              }
            }
          }
          if (uniqueRoots.size > 0) {
            ctx.presenter.write(colors.cyan(`🌳 Auto-discovered roots:`) + "\n");
            for (const root of Array.from(uniqueRoots).sort()) {
              ctx.presenter.write(`   • ${colors.dim(root)}\n`);
            }
            ctx.presenter.write('\n');
          }
        }

        // Print policy summary if any policy flags were set
        if (hasPolicyFlags) {
          const policyParts: string[] = [];
          if (allowParsed) { policyParts.push(`allow=[${allowParsed.join(', ')}]`); }
          if (denyParsed) { policyParts.push(`deny=[${denyParsed.join(', ')}]`); }
          if (forceLocalParsed) { policyParts.push(`forceLocal=[${forceLocalParsed.join(', ')}]`); }
          if (forceNpmParsed) { policyParts.push(`forceNpm=[${forceNpmParsed.join(', ')}]`); }
          ctx.presenter.write(colors.cyan(`📋 Policy: `) + colors.dim(policyParts.join(' ')) + "\n\n");
        }

        if (result.plan?.actions && result.plan.actions.length > 0) {
          // Convert plan actions to table rows
          const rows = result.plan.actions.map((action: any) => ({
            target: action.target || "N/A",
            dep: action.dep || action.dependency || "N/A",
            kind: action.kind || "N/A",
            reason: action.reason || "N/A",
          }));

          ctx.presenter.write(printTable(rows));
          ctx.presenter.write(`\n${colors.bold('Total actions:')} ${result.plan.actions.length}\n`);
        } else if (hasEmptyPlan) {
          ctx.presenter.write(colors.yellow("⚠️  No operations planned (diagnostics present).") + "\n");
        } else {
          ctx.presenter.write("No operations planned.\n");
        }

        // Show cycles warning
        if (hasCycles) {
          ctx.presenter.write("\n" + colors.yellow("⚠️  Warning: Dependency cycles detected:") + "\n");
          const cycles = result.plan?.graph?.cycles || [];
          for (const cycle of cycles) {
            const path = cycle.join(" → ");
            ctx.presenter.write(`   • ${colors.dim(path)}\n`);
          }
        }

        // Show diagnostics if any
        if (result.diagnostics && result.diagnostics.length > 0) {
          ctx.presenter.write("\n" + colors.cyan("📝 Diagnostics:") + "\n");
          for (const diag of result.diagnostics) {
            ctx.presenter.write(`   • ${colors.dim(diag)}\n`);
          }
        }

        ctx.presenter.write(`\n${colors.cyan('📁 Plan saved to:')} ${colors.dim(planPath)}\n`);
        if (rootsParsed && rootsParsed.length > 0) {
          ctx.presenter.write(`${colors.cyan('🌳 Additional roots:')} ${colors.dim(rootsParsed.join(', '))}\n`);
        }

        // Add footer
        const summary = { executed: result.plan?.actions?.length || 0, skipped: 0, errors: 0 };
        ctx.presenter.write(formatFooter(summary, duration, hasWarnings));
      }

      // Exit codes: 0 if ok, 2 if warnings/empty plan with diagnostics, 1 if errors
      if (!result.ok) {
        return 1;
      }
      if (hasWarnings || isEmptyPlanWarning) {
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

