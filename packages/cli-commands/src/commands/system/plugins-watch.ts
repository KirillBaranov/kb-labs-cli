/**
 * plugins:watch command - Watch for manifest changes and hot-reload
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import { watch } from 'node:fs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { discoverManifests } from '../../registry/discover';
import { registerManifests } from '../../registry/register';
import { registry } from '../../registry/service';
import { registerShutdownHook } from '../../utils/shutdown';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsWatchResult = CommandResult;

type PluginsWatchFlags = {
  json: { type: 'boolean'; description?: string };
};

export const pluginsWatch = defineSystemCommand<PluginsWatchFlags, PluginsWatchResult>({
  name: 'watch',
  description: 'Watch for plugin manifest changes and hot-reload',
  category: 'plugins',
  examples: generateExamples('watch', 'plugins', [
    { flags: {} },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'plugins:watch',
    startEvent: 'PLUGINS_WATCH_STARTED',
    finishEvent: 'PLUGINS_WATCH_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const jsonMode = flags.json; // Type-safe: boolean
    const cwd = getContextCwd(ctx);

    if (jsonMode) {
      throw new Error('Watch mode requires interactive terminal');
    }

    ctx.platform?.logger?.info('Starting plugin watch mode');
    ctx.ui.info(`${ctx.ui.symbols.info} Watching for plugin manifest changes...`);
    ctx.ui.info(`${ctx.ui.colors.muted('Press Ctrl+C to stop')}\n`);

    const watchedPaths = new Set<string>();
    const watchers = new Map<string, ReturnType<typeof watch>>();

    async function reloadManifests() {
      try {
        const discovered = await discoverManifests(cwd, true); // Force no cache
        const result = await registerManifests(discovered, registry, { cwd });
        const registeredCount = result.registered.length;
        const skippedCount = result.skipped.length;
        ctx.platform?.logger?.info('Manifests reloaded', { registered: registeredCount, skipped: skippedCount });

        ctx.ui.write(
          `\n${ctx.ui.symbols.success} ${ctx.ui.colors.info('Reloaded manifests')} - ` +
            `${registeredCount} registered, ${skippedCount} skipped\n`,
        );
        if (skippedCount > 0) {
          for (const skip of result.skipped) {
            ctx.ui.write(`${ctx.ui.colors.warn('•')} ${skip.id} (${skip.source}): ${skip.reason}\n`);
          }
        }
      } catch (err: any) {
        ctx.platform?.logger?.error('Failed to reload manifests', { error: err.message });
        ctx.ui.error(err instanceof Error ? err : new Error(`Failed to reload: ${err.message}`));
      }
    }

    // Initial discovery
    await reloadManifests();

    // Watch for changes
    try {
      // Watch workspace packages
      const workspaceYaml = path.join(cwd, 'pnpm-workspace.yaml');
      try {
        const content = await fs.readFile(workspaceYaml, 'utf8');
        const { parse: parseYaml } = await import('yaml');
        const parsed = parseYaml(content) as { packages: string[] };
        const { glob } = await import('glob');

        for (const pattern of parsed.packages || []) {
          const pkgDirs = await glob(pattern, {
            cwd,
            absolute: false,
            ignore: ['.kb/**', 'node_modules/**', '**/node_modules/**'],
          });

          for (const dir of pkgDirs) {
            const pkgRoot = path.join(cwd, dir);
            const pkgJsonPath = path.join(pkgRoot, 'package.json');

            try {
              const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
              if (pkg.kb?.commandsManifest || pkg.exports?.['./kb/commands']) {
                const manifestPath = pkg.kb?.commandsManifest
                  ? path.join(pkgRoot, pkg.kb.commandsManifest)
                  : pkg.exports?.['./kb/commands'];

                if (manifestPath && !watchedPaths.has(manifestPath)) {
                  watchedPaths.add(manifestPath);

                  const watcher = watch(manifestPath, async (eventType: string) => {
                    if (eventType === 'change') {
                      ctx.platform?.logger?.debug('Manifest changed', { manifestPath });
                      ctx.ui.write(
                        `${ctx.ui.colors.muted(`[${new Date().toLocaleTimeString()}]`)} ${ctx.ui.colors.info('Manifest changed:')} ${manifestPath}\n`,
                      );
                      await reloadManifests();
                    }
                  });

                  watchers.set(manifestPath, watcher);
                }
              }
            } catch {
              // Skip
            }
          }
        }
      } catch {
        // No workspace file
      }

      // Watch config files
      const configPaths = [path.join(cwd, '.kb', 'kb.config.json'), path.join(cwd, '.kb', 'plugins.json')];

      for (const configPath of configPaths) {
        try {
          await fs.access(configPath);
          const watcher = watch(configPath, async (eventType: string) => {
            if (eventType === 'change') {
              ctx.platform?.logger?.debug('Config changed', { configPath });
              ctx.ui.write(
                `${ctx.ui.colors.muted(`[${new Date().toLocaleTimeString()}]`)} ${ctx.ui.colors.info('Config changed:')} ${path.basename(configPath)}\n`,
              );
              await reloadManifests();
            }
          });
          watchers.set(configPath, watcher);
        } catch {
          // File doesn't exist
        }
      }

      ctx.ui.write(
        `${ctx.ui.symbols.success} Watching ${watchedPaths.size} manifest file(s) and ${watchers.size - watchedPaths.size} config file(s)\n`,
      );
      ctx.platform?.logger?.info('Watch mode active', {
        manifests: watchedPaths.size,
        configs: watchers.size - watchedPaths.size,
      });

      const stopWatching = () => {
        for (const watcher of watchers.values()) {
          watcher.close();
        }
        watchers.clear();
      };

      registerShutdownHook(() => {
        ctx.ui.write(`\n${ctx.ui.colors.muted('Stopping watch...')}\n`);
        ctx.platform?.logger?.info('Stopping watch mode');
        stopWatching();
      });

      await new Promise(() => {}); // Never resolves
    } catch (err: any) {
      ctx.platform?.logger?.error('Watch failed', { error: err.message });
      throw err instanceof Error ? err : new Error(`Watch failed: ${err.message}`);
    }
  },
});

