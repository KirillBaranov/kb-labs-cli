import type { Command } from "../../types";
import { watch as startWatch, type WatchOptions, type DryRunResult, DevLinkWatcher, type AllDevLinkEvents } from "@kb-labs/devlink-core";
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
function formatHumanEvent(event: AllDevLinkEvents, ctx: any): void {
  const timestamp = colors.dim(new Date(event.timestamp).toLocaleTimeString());
  
  switch (event.kind) {
    case "devlink.preflight":
      ctx.presenter.write(`${colors.cyan("🔍 Preflight Validation")}\n\n`);
      
      // Create table header
      const header = `${colors.bold("Package")}${" ".repeat(25)}${colors.bold("Build Command")}${" ".repeat(20)}${colors.bold("Source")}${" ".repeat(15)}${colors.bold("Status")}\n`;
      ctx.presenter.write(header);
      ctx.presenter.write(`${"─".repeat(80)}\n`);
      
      // Add table rows
      for (const pkg of (event.packages || []) as any[]) {
        const packageName = pkg.package.padEnd(25);
        const buildCmd = (pkg.buildCommand || 'N/A').padEnd(20);
        const source = pkg.source.padEnd(15);
        const status = pkg.status === 'OK' ? colors.green('✓ OK') : colors.yellow('⚠ SKIP');
        
        ctx.presenter.write(`${packageName}${buildCmd}${source}${status}\n`);
      }
      
      // Add warnings for skipped packages
      const skippedPackages = (event.packages || []).filter((p: any) => p.status === 'SKIP');
      if (skippedPackages.length > 0) {
        ctx.presenter.write(`\n${colors.yellow("⚠ Warning:")} ${skippedPackages.length} package(s) skipped (no build script)\n`);
        ctx.presenter.write(`${colors.dim("  Run 'kb devkit sync' to add standard build scripts\n\n")}`);
      } else {
        ctx.presenter.write(`\n`);
      }
      break;

    case "devlink.watch.ready":
      ctx.presenter.write(
        `${colors.cyan("🔭 devlink:watch")}  ` +
        `mode=${colors.bold(event.mode || "auto")}  ` +
        `providers=${colors.bold(event.providers?.toString() || "0")}  ` +
        `consumers=${colors.bold(event.consumers?.toString() || "0")}\n`
      );
      break;

    case "devlink.build.start":
      const files = event.changedFiles?.slice(0, 3).join(", ") || "";
      const moreFiles = event.changedFiles && event.changedFiles.length > 3 ? ` +${event.changedFiles.length - 3} more` : "";
      ctx.presenter.write(
        `${colors.blue("🔨")} ${colors.cyan(event.package || "")} building (${event.command || "build"})\n`
      );
      if (files) {
        ctx.presenter.write(`  ${colors.dim(files)}${moreFiles ? colors.dim(moreFiles) : ""}\n`);
      }
      break;

    case "devlink.build.result":
      const duration = event.durationMs ? formatDuration(event.durationMs) : "unknown";
      if (event.success) {
        ctx.presenter.write(
          `${colors.green("✅")} ${colors.cyan(event.package || "")} built in ${colors.bold(duration)}\n`
        );
      } else {
        ctx.presenter.write(
          `${colors.red("❌")} ${colors.cyan(event.package || "")} build failed (exit ${event.exitCode})\n`
        );
        if (event.stderrHead && event.stderrHead.length > 0) {
          ctx.presenter.write("  Error output:\n");
          event.stderrHead.slice(0, 5).forEach((line: string) => {
            ctx.presenter.write(`    ${colors.red(line)}\n`);
          });
          if (event.stderrHead.length > 5) {
            ctx.presenter.write(`    ... and ${event.stderrHead.length - 5} more lines\n`);
          }
        }
      }
      break;

    case "devlink.relink.done":
      const consumerCount = event.consumers?.length || 0;
      const consumerList = event.consumers?.slice(0, 2).join(", ") || "";
      const moreConsumers = consumerCount > 2 ? ` +${consumerCount - 2} more` : "";
      ctx.presenter.write(
        `${colors.green("🔗")} relink ${colors.cyan(event.producer || "")} → ${consumerList}${moreConsumers} (${event.filesTouched} files)\n`
      );
      break;

    case "devlink.watch.stopped":
      ctx.presenter.write(`\n${colors.cyan("🔭 devlink:watch")} ${colors.dim("stopped")}\n`);
      break;
      
    case "devlink.loopguard.cooldown":
      ctx.presenter.write(
        `${colors.yellow("⏸")} ${colors.cyan(event.package || "")} cooldown ${event.cooldownMs/1000}s (loop guard)\n`
      );
      break;
      
    case "devlink.degraded.hashing":
      const status = event.enabled ? "enabled" : "disabled";
      ctx.presenter.write(
        `${colors.blue("🔍")} ${colors.cyan(event.package || "")} degraded hashing ${status} (${event.reason})\n`
      );
      break;
      
      
    case "devlink.info.skipped_no_change":
      ctx.presenter.write(
        `${colors.dim("•")} ${colors.cyan(event.package || "")} unchanged (skip)\n`
      );
      break;
  }
}

/**
 * Format JSON event (line-delimited)
 */
function formatJsonEvent(event: AllDevLinkEvents, ctx: any): void {
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
export const watch: Command = {
  name: "watch",
  describe: "Watch providers and rebuild/refresh consumers on changes",
  longDescription: "Monitors provider packages for changes, automatically rebuilds them, and refreshes dependent consumers in real-time",
  category: "devlink",
  aliases: ["devlink:watch"],
  examples: [
    "kb devlink watch",
    "kb devlink watch --mode local",
    "kb devlink watch --providers '@kb-labs/*'",
    "kb devlink watch --dry-run",
    "kb devlink watch --json"
  ],
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
      name: "per-package-debounce-ms",
      type: "number",
      description: "Per-package debounce window in ms (default: 200)",
    },
    {
      name: "global-concurrency",
      type: "number",
      description: "Max parallel builds globally (default: 5)",
    },
    {
      name: "build-timeout-ms",
      type: "number",
      description: "Build timeout in ms (default: 60000)",
    },
    {
      name: "strict-preflight",
      type: "boolean",
      description: "Exit with code 1 if any package has no build script",
    },
    {
      name: "profile",
      type: "number",
      description: "Profile interval in ms (print stats every N ms)",
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
    // @deprecated flags
    {
      name: "debounce",
      type: "number",
      description: "[DEPRECATED] Use --per-package-debounce-ms instead",
    },
    {
      name: "concurrency",
      type: "number",
      description: "[DEPRECATED] Use --global-concurrency instead",
    },
    {
      name: "no-build",
      type: "boolean",
      description: "[DEPRECATED] Not supported in v2",
    },
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      mode: undefined,
      providers: undefined,
      consumers: undefined,
      "per-package-debounce-ms": undefined,
      "global-concurrency": undefined,
      "build-timeout-ms": undefined,
      "strict-preflight": false,
      profile: undefined,
      "exit-on-error": false,
      "dry-run": false,
      json: false,
      // @deprecated
      debounce: undefined,
      concurrency: undefined,
      "no-build": false,
    };

    const finalFlags = { ...defaultFlags, ...flags };
    const {
      mode,
      providers,
      consumers,
      "per-package-debounce-ms": perPackageDebounceMs,
      "global-concurrency": globalConcurrency,
      "build-timeout-ms": buildTimeoutMs,
      "strict-preflight": strictPreflight,
      profile,
      "exit-on-error": exitOnError,
      "dry-run": dryRun,
      json,
      // @deprecated - map to new flags
      debounce,
      concurrency,
      "no-build": noBuild,
    } = finalFlags;

    const rootDir = process.cwd();

    // Normalize providers and consumers to arrays
    const providersArray = providers 
      ? (Array.isArray(providers) ? providers : [providers])
      : undefined;
    const consumersArray = consumers
      ? (Array.isArray(consumers) ? consumers : [consumers])
      : undefined;

    // Map deprecated flags to new ones
    const effectivePerPackageDebounceMs = perPackageDebounceMs ?? debounce;
    const effectiveGlobalConcurrency = globalConcurrency ?? concurrency;
    
    // Warn about deprecated flags
    if (debounce !== undefined) {
      console.warn("⚠️  --debounce is deprecated, use --per-package-debounce-ms instead");
    }
    if (concurrency !== undefined) {
      console.warn("⚠️  --concurrency is deprecated, use --global-concurrency instead");
    }
    if (noBuild) {
      console.warn("⚠️  --no-build is not supported in v2");
    }

    const options: any = {
      rootDir,
      mode: mode as "auto" | "local" | "yalc" | undefined,
      providers: providersArray as string[] | undefined,
      consumers: consumersArray as string[] | undefined,
      perPackageDebounceMs: effectivePerPackageDebounceMs as number | undefined,
      globalConcurrency: effectiveGlobalConcurrency as number | undefined,
      buildTimeoutMs: buildTimeoutMs as number | undefined,
      strictPreflight,
      profile: profile as number | undefined,
      exitOnError,
      dryRun,
      json,
    };

    try {
      const watcher = await startWatch(options);

      // Handle dry-run result
      if (options.dryRun) {
        watcher.once("dryrun", (result: DryRunResult) => {
          formatDryRun(result, ctx, json);
        });
        return 0;
      }

      // Handle watch events
      watcher.on("event", (event: AllDevLinkEvents) => {
        if (json) {
          formatJsonEvent(event, ctx);
        } else {
          formatHumanEvent(event, ctx);
        }
      });

      // Graceful shutdown on Ctrl+C
      const shutdown = async () => {
        if (!json) {
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
      
      if (json) {
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

