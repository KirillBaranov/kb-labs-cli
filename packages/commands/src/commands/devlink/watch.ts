import type { Command } from "../../types";
import { watch as startWatch, type WatchOptions, type WatchEvent, type DryRunResult, DevLinkWatcher } from "@kb-labs/devlink-core";
import { colors } from "@kb-labs/cli-core";

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format human-readable watch event
 */
function formatHumanEvent(event: WatchEvent, ctx: any): void {
  const timestamp = colors.dim(new Date(event.ts).toLocaleTimeString());
  
  switch (event.type) {
    case "started":
      ctx.presenter.write(
        `${colors.cyan("🔭 devlink:watch")}  ` +
        `mode=${colors.bold(event.mode || "auto")}  ` +
        `providers=${colors.bold(event.providers?.toString() || "0")}  ` +
        `consumers=${colors.bold(event.consumersCount?.toString() || "0")}\n`
      );
      break;

    case "ready":
      const readyProviders = event.providers || 0;
      const readyConsumers = event.consumersCount || 0;
      ctx.presenter.write(
        `${colors.green("✓")} Ready! Watching ${colors.bold(readyProviders.toString())} provider${readyProviders !== 1 ? "s" : ""} ` +
        `${colors.dim("→")} ${colors.bold(readyConsumers.toString())} consumer${readyConsumers !== 1 ? "s" : ""}\n`
      );
      ctx.presenter.write(
        `${colors.dim("  Edit any source file to trigger rebuild...")}\n\n`
      );
      break;

    case "changed":
      const files = event.files?.slice(0, 3).join(", ") || "";
      const moreFiles = event.files && event.files.length > 3 ? ` +${event.files.length - 3} more` : "";
      ctx.presenter.write(
        `${colors.yellow("•")} change  ${colors.cyan(event.pkg || "")}  ${colors.dim(files + moreFiles)}\n`
      );
      break;

    case "building":
      ctx.presenter.write(
        `  ${colors.dim("↳")} build  ${colors.cyan(event.pkg || "")}  ${colors.dim(event.command || "")}\n`
      );
      break;

    case "built":
      const buildTime = event.duration ? colors.dim(`(${formatDuration(event.duration)})`) : "";
      ctx.presenter.write(
        `  ${colors.dim("↳")} ${colors.green("built")}  ${colors.cyan(event.pkg || "")}  ${buildTime}\n`
      );
      break;

    case "build-error":
      ctx.presenter.write(
        `  ${colors.red("✗")} build failed  ${colors.cyan(event.pkg || "")}  ${colors.red(event.error || "")}\n`
      );
      break;

    case "refreshing":
      const consumerCount = event.consumers?.length || 0;
      const consumerList = event.consumers?.slice(0, 2).join(", ") || "";
      const moreConsumers = consumerCount > 2 ? ` +${consumerCount - 2} more` : "";
      ctx.presenter.write(
        `  ${colors.dim("↳")} refresh  ${colors.dim(consumerList + moreConsumers)} ${colors.dim(`(${consumerCount} consumers)`)}\n`
      );
      break;

    case "refreshed":
      const refreshTime = event.duration ? colors.dim(`(${formatDuration(event.duration)})`) : "";
      ctx.presenter.write(
        `  ${colors.dim("↳")} ${colors.green("refreshed")}  ${refreshTime}\n`
      );
      ctx.presenter.write(`${colors.green("✔")} done\n\n`);
      break;

    case "refresh-error":
      ctx.presenter.write(
        `  ${colors.red("✗")} refresh failed  ${colors.red(event.error || "")}\n\n`
      );
      break;

    case "error":
      ctx.presenter.write(
        `${colors.red("✗ Error:")} ${event.pkg ? `${event.pkg} - ` : ""}${colors.red(event.error || "")}\n`
      );
      break;

    case "stopped":
      ctx.presenter.write(`\n${colors.cyan("🔭 devlink:watch")} ${colors.dim("stopped")}\n`);
      break;
  }
}

/**
 * Format JSON event (line-delimited)
 */
function formatJsonEvent(event: WatchEvent, ctx: any): void {
  ctx.presenter.write(JSON.stringify(event) + "\n");
}

/**
 * Format dry-run result
 */
function formatDryRun(result: DryRunResult, ctx: any, jsonMode: boolean): void {
  if (jsonMode) {
    ctx.presenter.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  // Human-readable dry-run output
  ctx.presenter.write(colors.cyan(colors.bold("🔭 DevLink Watch (Dry Run)")) + "\n\n");
  
  ctx.presenter.write(colors.bold("Mode: ") + colors.cyan(result.mode) + "\n\n");

  // Providers
  ctx.presenter.write(colors.bold("📦 Providers") + colors.dim(` (${result.providers.length})`) + "\n");
  for (const provider of result.providers) {
    ctx.presenter.write(`  ${colors.cyan(provider.name)}\n`);
    ctx.presenter.write(`    ${colors.dim("Dir:")}     ${provider.dir}\n`);
    ctx.presenter.write(`    ${colors.dim("Build:")}   ${provider.buildCommand}\n`);
    ctx.presenter.write(`    ${colors.dim("Watch:")}   ${provider.watchPaths.join(", ")}\n`);
  }

  // Consumers
  ctx.presenter.write("\n" + colors.bold("👥 Consumers") + colors.dim(` (${result.consumers.length})`) + "\n");
  for (const consumer of result.consumers) {
    const scriptIndicator = consumer.hasRefreshScript ? colors.green("✓ script") : colors.dim("no script");
    ctx.presenter.write(`  ${colors.cyan(consumer.name)}  ${scriptIndicator}\n`);
  }

  // Dependencies
  ctx.presenter.write("\n" + colors.bold("🔗 Dependencies") + "\n");
  for (const dep of result.dependencies) {
    if (dep.consumers.length > 0) {
      ctx.presenter.write(`  ${colors.cyan(dep.provider)} ${colors.dim("→")} ${dep.consumers.join(", ")}\n`);
    }
  }

  ctx.presenter.write("\n" + colors.dim("Run without --dry-run to start watching") + "\n");
}

/**
 * kb devlink watch command
 */
export const watchCommand: Command = {
  name: "watch",
  describe: "Watch providers and rebuild/refresh consumers on changes",
  category: "devlink",
  aliases: ["devlink:watch"],
  flags: [
    {
      name: "mode",
      type: "string",
      description: "Watch mode: auto, local, yalc",
      choices: ["auto", "local", "yalc"],
    },
    {
      name: "providers",
      type: "array",
      description: "Filter providers by glob patterns",
    },
    {
      name: "consumers",
      type: "array",
      description: "Filter consumers by glob patterns",
    },
    {
      name: "debounce",
      type: "number",
      description: "Debounce window in ms (default: 200)",
    },
    {
      name: "concurrency",
      type: "number",
      description: "Max parallel builds (default: 4)",
    },
    {
      name: "no-build",
      type: "boolean",
      description: "Skip build, only refresh consumers",
    },
    {
      name: "exit-on-error",
      type: "boolean",
      description: "Exit on first build error",
    },
    {
      name: "dry-run",
      type: "boolean",
      description: "Show what would be watched without starting",
    },
    {
      name: "json",
      type: "boolean",
      description: "Output events as line-delimited JSON",
    },
  ],

  async run(ctx, argv, flags) {
    const rootDir = process.cwd();
    const jsonMode = flags.json === true || ctx.global.json === true;

    const options: WatchOptions = {
      rootDir,
      mode: flags.mode as "auto" | "local" | "yalc" | undefined,
      providers: flags.providers as string[] | undefined,
      consumers: flags.consumers as string[] | undefined,
      debounce: flags.debounce as number | undefined,
      concurrency: flags.concurrency as number | undefined,
      noBuild: flags["no-build"] === true,
      exitOnError: flags["exit-on-error"] === true,
      dryRun: flags["dry-run"] === true,
      json: jsonMode,
    };

    try {
      const watcher = await startWatch(options);

      // Handle dry-run result
      if (options.dryRun) {
        watcher.once("dryrun", (result: DryRunResult) => {
          formatDryRun(result, ctx, jsonMode);
        });
        return 0;
      }

      // Handle watch events
      watcher.on("event", (event: WatchEvent) => {
        if (jsonMode) {
          formatJsonEvent(event, ctx);
        } else {
          formatHumanEvent(event, ctx);
        }
      });

      // Graceful shutdown on Ctrl+C
      const shutdown = async () => {
        if (!jsonMode) {
          ctx.presenter.write("\n" + colors.dim("Shutting down...") + "\n");
        }
        await watcher.stop();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Keep process alive
      await new Promise(() => {});

      return 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (jsonMode) {
        ctx.presenter.json({
          ok: false,
          error: {
            code: "WATCH_FAILED",
            message: errorMessage,
          },
        });
      } else {
        ctx.presenter.write(colors.red("Error: ") + errorMessage + "\n");
      }

      return 1;
    }
  },
};

