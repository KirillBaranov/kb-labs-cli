/**
 * @module @kb-labs/cli-core/registry/watch-manager
 * File system watcher for plugin manifests and configuration
 */

import * as chokidar from "chokidar";
import * as path from "node:path";
import { getLogger } from "@kb-labs/core-sys/logging";

const logger = getLogger("WatchManager");

export interface WatchOptions {
  /** Root directories to watch */
  roots: string[];
  /** Callback when files change */
  onChange: () => Promise<void>;
  /** Debounce delay in ms */
  debounceMs?: number;
}

/**
 * WatchManager - monitors file system for plugin manifest changes
 */
export class WatchManager {
  private watcher?: chokidar.FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private isRefreshing = false;

  constructor(private opts: WatchOptions) {}

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this.watcher) {
      logger.warn("Already watching");
      return;
    }

    const patterns = this.buildWatchPatterns();

    logger.info("Starting file watch", {
      roots: this.opts.roots,
      patternsCount: patterns.length,
    });

    this.watcher = chokidar.watch(patterns, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles except .kb
        /node_modules(?!.*\.kb)/, // Ignore node_modules unless in .kb
        /dist/,
        /build/,
        /coverage/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      depth: 10, // Limit recursion depth
    });

    this.watcher.on("add", (filePath) => this.handleChange("add", filePath));
    this.watcher.on("change", (filePath) =>
      this.handleChange("change", filePath),
    );
    this.watcher.on("unlink", (filePath) =>
      this.handleChange("unlink", filePath),
    );

    this.watcher.on("error", (error) => {
      logger.error("Watcher error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    this.watcher.on("ready", () => {
      logger.info("Initial scan complete, watching for changes");
    });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
      logger.info("Stopped watching");
    }
  }

  /**
   * Build watch patterns for chokidar
   */
  private buildWatchPatterns(): string[] {
    const patterns: string[] = [];

    for (const root of this.opts.roots) {
      // Watch for manifest files
      patterns.push(path.join(root, "**/manifest.v2.ts"));
      patterns.push(path.join(root, "**/manifest.v2.js"));
      patterns.push(path.join(root, "**/manifest.ts"));
      patterns.push(path.join(root, "**/manifest.js"));

      // Watch for package.json changes (kbLabs field)
      patterns.push(path.join(root, "**/package.json"));

      // Watch .kb/plugins directory
      patterns.push(path.join(root, ".kb/plugins/**/*"));

      // Watch lockfiles (affects workspace resolution)
      patterns.push(path.join(root, "pnpm-lock.yaml"));
      patterns.push(path.join(root, "yarn.lock"));
      patterns.push(path.join(root, "package-lock.json"));

      // Watch workspace config
      patterns.push(path.join(root, "pnpm-workspace.yaml"));
    }

    return patterns;
  }

  /**
   * Handle file change event
   */
  private handleChange(
    event: "add" | "change" | "unlink",
    filePath: string,
  ): void {
    logger.debug("File change detected", { event, filePath });

    // Debounce: wait for multiple changes to settle
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const debounceMs = this.opts.debounceMs ?? 500;

    this.debounceTimer = setTimeout(() => {
      this.triggerRefresh(filePath);
    }, debounceMs);
  }

  /**
   * Trigger plugin registry refresh
   */
  private async triggerRefresh(triggerFile: string): Promise<void> {
    if (this.isRefreshing) {
      logger.debug("Refresh already in progress, skipping", { triggerFile });
      return;
    }

    this.isRefreshing = true;

    try {
      logger.debug("Triggering refresh", { triggerFile });
      const start = Date.now();

      await this.opts.onChange();

      const duration = Date.now() - start;
      logger.debug("Refresh completed", { duration, triggerFile });
    } catch (error) {
      logger.error("Refresh failed", {
        triggerFile,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      this.isRefreshing = false;
    }
  }
}
