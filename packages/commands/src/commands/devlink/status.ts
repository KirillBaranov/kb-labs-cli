import type { Command } from "../../types";
import { status } from "@kb-labs/devlink-core";
import { colors } from "@kb-labs/cli-core";

export const devlinkStatus: Command = {
  name: "devlink:status",
  describe: "Show DevLink status",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      json: false,
      roots: undefined,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { json, roots } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Parse roots (comma-separated absolute paths)
      let rootsParsed: string[] | undefined;
      if (roots && typeof roots === 'string') {
        const rootsStr = roots as string;
        if (rootsStr.trim()) {
          rootsParsed = rootsStr.split(',').map((r: string) => r.trim()).filter(Boolean);
        }
      }

      // Get status
      const startTime = Date.now();
      const result = await status({
        rootDir,
        ...(rootsParsed && { roots: rootsParsed }),
      } as any);
      const duration = Date.now() - startTime;

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: true,
          packages: result.packages,
          links: result.links,
          unknown: result.unknown,
          entries: result.entries,
          meta: {
            packages: result.packages,
            links: result.links,
            unknown: result.unknown,
          },
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        ctx.presenter.write(colors.cyan(colors.bold("📊 DevLink Status")) + "\n");
        ctx.presenter.write(colors.dim("=================") + "\n\n");

        // Show aggregate status
        ctx.presenter.write(`${colors.cyan('Total packages:')} ${result.packages}\n`);
        ctx.presenter.write(`${colors.cyan('Linked dependencies:')} ${result.links}\n`);
        ctx.presenter.write(`${colors.cyan('Unknown status:')} ${result.unknown}\n`);

        // Show detailed entries if available
        if (result.entries && result.entries.length > 0) {
          ctx.presenter.write("\n" + colors.bold("Dependencies:") + "\n");

          // Group entries by consumer
          const byConsumer = new Map<string, typeof result.entries>();
          for (const entry of result.entries) {
            if (!byConsumer.has(entry.consumer)) {
              byConsumer.set(entry.consumer, []);
            }
            byConsumer.get(entry.consumer)!.push(entry);
          }

          for (const [consumer, deps] of byConsumer) {
            ctx.presenter.write(`\n  ${colors.cyan(consumer)}:\n`);
            for (const dep of deps) {
              const icon = dep.source === "yalc" ? "🔗" :
                dep.source === "workspace" ? "📦" :
                  dep.source === "npm" ? "📡" : "❓";
              const sourceColor = dep.source === "yalc" ? colors.green :
                dep.source === "workspace" ? colors.blue :
                  dep.source === "npm" ? colors.yellow : colors.dim;
              ctx.presenter.write(`    ${icon} ${dep.dep} ${colors.dim('(' + sourceColor(dep.source) + ')')}\n`);
            }
          }
        } else {
          ctx.presenter.write("\nNo dependencies tracked.\n");
        }

        ctx.presenter.write(`\n${colors.dim('⏱️  Duration:')} ${colors.dim(`${duration}ms`)}\n`);
      }

      return 0;
    } catch (error: any) {
      if (json) {
        ctx.presenter.json({
          ok: false,
          error: {
            message: error.message,
            code: error.code || "STATUS_ERROR",
            ...(error.cause && { cause: error.cause }),
          },
        });
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

