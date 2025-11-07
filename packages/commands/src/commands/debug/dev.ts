/**
 * dev command - Watch mode with hot reload
 */

import type { Command } from '../../types/types';
import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import type { CliContext } from '@kb-labs/cli-core';
import { registry } from '../../utils/registry';
import type { ManifestV2, CliCommandDecl } from '@kb-labs/plugin-manifest';
import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getContextCwd } from '../../utils/context';

interface DevRun {
  id: string;
  timestamp: string;
  exitCode: number;
  duration: number;
  result?: unknown;
}

export const dev: Command = {
  name: 'dev',
  category: 'debug',
  describe: 'Watch mode with hot reload for plugin development',
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
    },
    {
      name: 'debounce',
      type: 'number',
      description: 'Debounce delay in milliseconds (default: 250)',
    },
  ],
  examples: [
    'kb dev mind:query --query "test"',
    'kb dev mind:init --force',
  ],

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>) {
    const jsonMode = Boolean(flags.json);
    const debounceMs = typeof flags.debounce === 'number' ? flags.debounce : 250;

    // Parse command name and args
    const rawCommandName = argv[0];
    if (!rawCommandName) {
      ctx.presenter.error('Please provide command name (e.g., mind:query)');
      ctx.presenter.info('Usage: kb dev <plugin>:<command> [flags...]');
      return 1;
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
      ctx.presenter.error(`Plugin ${pluginName} not found`);
      ctx.presenter.info('Use `kb plugins` to see available plugins');
      return 1;
    }

    if (!registered.available) {
      ctx.presenter.error(`Plugin ${pluginName} is not available: ${registered.unavailableReason}`);
      return 1;
    }

    const manifestV2 = registered.manifest.manifestV2 as ManifestV2 | undefined;
    if (!manifestV2) {
      ctx.presenter.error(`Plugin ${pluginName} has no ManifestV2`);
      return 1;
    }

    const cliCommands = manifestV2.cli?.commands ?? [];
    const cliCommand: CliCommandDecl | undefined = commandId
      ? cliCommands.find((c) => c.id === commandId)
      : cliCommands[0];

    if (!cliCommand || !cliCommand.handler) {
      ctx.presenter.error(`Command ${commandName} not found in plugin manifest`);
      return 1;
    }

    // Determine watch paths (plugin source files)
    const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });
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
      ctx.presenter.warn('No source files found to watch');
      ctx.presenter.info('Falling back to watching plugin root directory');
      watchPaths.push(pluginRoot);
    }

    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        command: commandName,
        pluginId: manifestV2.id,
        watchPaths,
        ready: true,
      });
      return 0;
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
          ctx.presenter.info(`↻ ${reason} - Reloading...`);
        } else {
          ctx.presenter.info(`✓ Executing ${commandName}...`);
        }

        const exitCode = await executeCommand(
          cliCommand,
          manifestV2,
          ctx,
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

          ctx.presenter.info(`${durationEmoji} Executed in ${duration}ms (${durationDiffStr}ms)`);

          if (exitCode !== lastRun.exitCode) {
            const exitCodeEmoji = exitCode === 0 ? '✓' : '✗';
            ctx.presenter.warn(`⚠ Exit code changed: ${lastRun.exitCode} → ${exitCode} ${exitCodeEmoji}`);
          }

          const timeDiff = Date.now() - new Date(lastRun.timestamp).getTime();
          ctx.presenter.info(`  Time since last run: ${timeDiff}ms`);
        } else {
          ctx.presenter.info(`✓ Executed in ${duration}ms`);
        }

        lastRun = currentRun;
        ctx.presenter.info('');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.presenter.error(`Execution failed: ${message}`);
        ctx.presenter.info('');
      } finally {
        isRunning = false;
      }
    };

    // Initial run
    await runCommand('Initial run');

    // Setup file watchers
    ctx.presenter.info(`Watching: ${watchPaths.join(', ')}`);
    ctx.presenter.info('Press Ctrl+C to stop');
    ctx.presenter.info('');

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
      ctx.presenter.info('\n👋 Stopping watch mode...');

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

      ctx.presenter.info('✓ Watch mode stopped');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive
    return new Promise(() => {
      /* keep process running */
    });
  },
};

