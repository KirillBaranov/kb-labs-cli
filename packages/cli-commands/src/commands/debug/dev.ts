/**
 * dev command - Watch mode with hot reload
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import { registry } from '../../registry/service';
import type { ManifestV2, CliCommandDecl } from '@kb-labs/plugin-manifest';
import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { registerShutdownHook } from '../../utils/shutdown';

interface DevRun {
  id: string;
  timestamp: string;
  exitCode: number;
  duration: number;
  result?: unknown;
}

type DevResult = CommandResult & {
  command?: string;
  pluginId?: string;
  watchPaths?: string[];
  debounceMs?: number;
};

type DevFlags = {
  json: { type: 'boolean'; description?: string };
  debounce: { type: 'number'; description?: string };
};

export const dev = defineSystemCommand<DevFlags, DevResult>({
  name: 'dev',
  description: 'Watch mode with hot reload for plugin development',
  category: 'debug',
  examples: ['kb dev mind:query --query "test"', 'kb dev mind:init --force'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
    debounce: { type: 'number', description: 'Debounce delay in milliseconds (default: 250)' },
  },
  analytics: {
    command: 'dev',
    startEvent: 'DEV_STARTED',
    finishEvent: 'DEV_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const debounceMs = flags.debounce ?? 250; // Type-safe: number | undefined -> number

    // Parse command name and args
    const rawCommandName = argv[0];
    if (!rawCommandName) {
      throw new Error('Please provide command name (e.g., mind:query)');
    }

    const commandName = rawCommandName;
    const [pluginName, commandIdRaw] = commandName.includes(':')
      ? commandName.split(':', 2)
      : [commandName, ''];
    const commandId = commandIdRaw ?? '';

    // Parse remaining args as flags
    const commandFlags: Record<string, unknown> = {};
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) {
        continue;
      }
      if (arg.startsWith('--')) {
        const key = arg.slice(2).replace(/-/g, '');
        const nextArg = argv[i + 1];
        if (typeof nextArg === 'string' && !nextArg.startsWith('-')) {
          commandFlags[key] = nextArg;
          i++;
        } else {
          commandFlags[key] = true;
        }
      }
    }

    // Find command in registry
    const manifests = registry.listManifests?.() ?? [];
    const registered = manifests.find((m) => {
      const manifestId = m.manifest.manifestV2?.id ?? m.manifest.package;
      return manifestId === pluginName || m.manifest.package === pluginName;
    });

    if (!registered) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    if (!registered.available) {
      throw new Error(`Plugin ${pluginName} is not available: ${registered.unavailableReason}`);
    }

    const manifestV2 = registered.manifest.manifestV2 as ManifestV2 | undefined;
    if (!manifestV2) {
      throw new Error(`Plugin ${pluginName} has no ManifestV2`);
    }

    const cliCommands = manifestV2.cli?.commands ?? [];
    const cliCommand: CliCommandDecl | undefined = commandId
      ? cliCommands.find((c) => c.id === commandId)
      : cliCommands[0];

    if (!cliCommand || !cliCommand.handler) {
      throw new Error(`Command ${commandName} not found in plugin manifest`);
    }

    // Determine watch paths (plugin source files)
    const cwd = getContextCwd(ctx);
    const pluginRoot = registered.pkgRoot ?? cwd;
    const srcDir = path.join(pluginRoot, 'src');
    const distDir = path.join(pluginRoot, 'dist');

    // Check if src directory exists
    const watchPaths: string[] = [];
    try {
      const srcExists = await fs.access(srcDir).then(() => true).catch(() => false);
      if (srcExists) {
        watchPaths.push(srcDir);
      }

      // Also watch dist for handler changes
      const distExists = await fs.access(distDir).then(() => true).catch(() => false);
      if (distExists) {
        const handlerPath = cliCommand.handler.replace(/^\.\//, '').replace(/#.*$/, '');
        const handlerFile = path.join(distDir, `${handlerPath}.js`);
        const handlerExists = await fs.access(handlerFile).then(() => true).catch(() => false);
        if (handlerExists) {
          watchPaths.push(handlerFile);
        } else {
          watchPaths.push(distDir);
        }
      }
    } catch {
      // Ignore errors
    }

    if (watchPaths.length === 0) {
      ctx.output?.warn('No source files found to watch');
      ctx.output?.info('Falling back to watching plugin root directory');
      watchPaths.push(pluginRoot);
    }

    if (flags.json) {
      return {
        ok: true,
        command: commandName,
        pluginId: manifestV2.id,
        watchPaths,
        ready: true,
      };
    }

    // Helper to run command
    let isRunning = false;
    let lastRun: DevRun | undefined;
    let debounceTimer: NodeJS.Timeout | undefined;

    const runCommand = async (reason: string): Promise<void> => {
      if (isRunning) {
        ctx.presenter.info('⏳ Already running, will restart after current run completes...');
        return;
      }

      isRunning = true;
      const runId = `run-${Date.now()}`;
      const startTime = Date.now();

      try {
        if (lastRun) {
          ctx.output?.info(`↻ ${reason} - Reloading...`);
        } else {
          ctx.output?.info(`✓ Executing ${commandName}...`);
        }

        const exitCode = await executeCommand(
          cliCommand,
          manifestV2,
          ctx as any,
          commandFlags,
          manifestV2.capabilities ?? [],
          pluginRoot,
          cwd,
          undefined,
          undefined
        );

        const duration = Date.now() - startTime;
        const currentRun: DevRun = {
          id: runId,
          timestamp: new Date().toISOString(),
          exitCode,
          duration,
        };

        if (lastRun) {
          const durationDiff = duration - lastRun.duration;
          const durationDiffStr = durationDiff >= 0 ? `+${durationDiff}` : `${durationDiff}`;
          const durationEmoji = durationDiff < 0 ? '✓' : durationDiff > 100 ? '⚠' : '✓';

          ctx.output?.info(`${durationEmoji} Executed in ${duration}ms (${durationDiffStr}ms)`);

          if (exitCode !== lastRun.exitCode) {
            const exitCodeEmoji = exitCode === 0 ? '✓' : '✗';
            ctx.output?.warn(`⚠ Exit code changed: ${lastRun.exitCode} → ${exitCode} ${exitCodeEmoji}`);
          }

          const timeDiff = Date.now() - new Date(lastRun.timestamp).getTime();
          ctx.output?.info(`  Time since last run: ${timeDiff}ms`);
        } else {
          ctx.output?.info(`✓ Executed in ${duration}ms`);
        }

        lastRun = currentRun;
        ctx.output?.info('');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.output?.error(`Execution failed: ${message}`);
        ctx.output?.info('');
      } finally {
        isRunning = false;
      }
    };

    // Initial run
    await runCommand('Initial run');

    // Setup file watchers
    ctx.output?.info(`Watching: ${watchPaths.join(', ')}`);
    ctx.output?.info('Press Ctrl+C to stop');
    ctx.output?.info('');

    const watchers: FSWatcher[] = watchPaths.map((watchPath) =>
      watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (!filename) {
          return;
        }

        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          const filePath = path.join(watchPath, filename.toString());
          void runCommand(`Changed: ${filePath}`);
        }, debounceMs);
      })
    );

    // Handle Ctrl+C gracefully
    const cleanup = async () => {
      ctx.output?.info('\n👋 Stopping watch mode...');

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      watchers.forEach((watcher) => {
        try {
          watcher.close();
        } catch {
          // Ignore errors
        }
      });

      ctx.output?.info('✓ Watch mode stopped');
    };

    registerShutdownHook(cleanup);

    return new Promise(() => {
      /* keep process running */
    });
  },
  formatter(result, ctx, flags) {
    if (flags.json && result) {
      ctx.output?.json(result);
    }
    // Interactive/watch mode is handled in handler
  },
});

