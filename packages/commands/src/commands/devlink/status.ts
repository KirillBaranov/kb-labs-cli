import type { Command } from "../../types";
import { status } from "@kb-labs/devlink-core";

export const devlinkStatus: Command = {
  name: "devlink:status",
  describe: "Show DevLink status",

  async run(ctx, argv, flags) {
    const defaultFlags = {
      json: false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const { json } = finalFlags;

    try {
      const rootDir = process.cwd();

      // Get status
      const startTime = Date.now();
      const result = await status({ rootDir });
      const duration = Date.now() - startTime;

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: result.ok,
          status: result.status,
          timings: {
            duration,
          },
        });
      } else {
        // Human-readable output
        ctx.presenter.write("📊 DevLink Status\n");
        ctx.presenter.write("=================\n\n");

        if (result.status) {
          // Show aggregate status
          const st = result.status;

          if (st.linked !== undefined) {
            ctx.presenter.write(`Linked packages: ${st.linked}\n`);
          }
          if (st.unlinked !== undefined) {
            ctx.presenter.write(`Unlinked packages: ${st.unlinked}\n`);
          }
          if (st.total !== undefined) {
            ctx.presenter.write(`Total packages: ${st.total}\n`);
          }

          // Show detailed items if available
          if (st.items && st.items.length > 0) {
            ctx.presenter.write("\nPackages:\n");
            for (const item of st.items) {
              const statusIcon = item.linked ? "🔗" : "⚪";
              const name = item.name || item.package || "N/A";
              const state = item.linked ? "linked" : "unlinked";
              ctx.presenter.write(`  ${statusIcon} ${name}: ${state}\n`);

              if (item.path) {
                ctx.presenter.write(`     Path: ${item.path}\n`);
              }
            }
          }

          // Show diagnostics if available
          if (st.diagnostics && st.diagnostics.length > 0) {
            ctx.presenter.write("\n⚠️  Diagnostics:\n");
            for (const diag of st.diagnostics) {
              const level = diag.level || "info";
              const icon = level === "error" ? "✗" : level === "warn" ? "⚠" : "ℹ";
              ctx.presenter.write(`  ${icon} ${diag.message}\n`);
            }
          }
        } else {
          ctx.presenter.write("No status information available.\n");
        }

        ctx.presenter.write(`\n⏱️  Duration: ${duration}ms\n`);
      }

      // Exit codes: 0 if ok, 2 if warnings, 1 if errors
      if (!result.ok) {
        return 1;
      }

      // Check for warnings in diagnostics
      if (result.status?.diagnostics && result.status.diagnostics.length > 0) {
        const hasErrors = result.status.diagnostics.some((d: any) => d.level === "error");
        const hasWarnings = result.status.diagnostics.some((d: any) => d.level === "warn");

        if (hasErrors) {
          return 1;
        }
        if (hasWarnings) {
          return 2;
        }
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

