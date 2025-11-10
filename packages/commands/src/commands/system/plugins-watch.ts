/**
 * plugins:watch command - Watch for manifest changes and hot-reload
 */

import type { Command } from "../../types/types";
import { watch } from 'node:fs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { discoverManifests } from '../../registry/discover';
import { registerManifests } from '../../registry/register';
import { registry } from "../../registry/service";
import { box, safeColors, safeSymbols } from "@kb-labs/shared-cli-ui";
import { registerShutdownHook } from '../../utils/shutdown';
import { getContextCwd } from "@kb-labs/shared-cli-ui";

export const pluginsWatch: Command = {
  name: "plugins:watch",
  category: "system",
  describe: "Watch for plugin manifest changes and hot-reload",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb plugins watch",
  ],

  async run(ctx, argv, flags) {
    const jsonMode = !!flags.json;
    const cwd = getContextCwd(ctx);
    
    if (jsonMode) {
      ctx.presenter.json({
        ok: false,
        error: "Watch mode requires interactive terminal",
      });
      return 1;
    }
    
    ctx.presenter.info(`${safeSymbols.info} Watching for plugin manifest changes...`);
    ctx.presenter.info(`${safeColors.dim('Press Ctrl+C to stop')}\n`);
    
    const watchedPaths = new Set<string>();
    const watchers = new Map<string, ReturnType<typeof watch>>();
    
    async function reloadManifests() {
      try {
        const discovered = await discoverManifests(cwd, true); // Force no cache
        const manifests = registry.listManifests();
        
        // Clear existing manifests
        for (const manifest of manifests) {
          // Note: Registry doesn't have clear, so we'll need to handle this differently
          // For now, just log
        }
        
        const result = await registerManifests(discovered, registry, { cwd });
        const registeredCount = result.registered.length;
        const skippedCount = result.skipped.length;
        ctx.presenter.write(
          `\n${safeSymbols.success} ${safeColors.info('Reloaded manifests')} - ` +
          `${registeredCount} registered, ${skippedCount} skipped\n`
        );
        if (skippedCount > 0) {
          for (const skip of result.skipped) {
            ctx.presenter.write(
              `${safeColors.warning('•')} ${skip.id} (${skip.source}): ${skip.reason}\n`
            );
          }
        }
      } catch (err: any) {
        ctx.presenter.error(`Failed to reload: ${err.message}`);
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
            ignore: ['.kb/**', 'node_modules/**', '**/node_modules/**']
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
                      ctx.presenter.write(`${safeColors.dim(`[${new Date().toLocaleTimeString()}]`)} ${safeColors.info('Manifest changed:')} ${manifestPath}\n`);
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
      const configPaths = [
        path.join(cwd, 'kb-labs.config.json'),
        path.join(cwd, '.kb', 'plugins.json'),
      ];
      
      for (const configPath of configPaths) {
        try {
          await fs.access(configPath);
          const watcher = watch(configPath, async (eventType: string) => {
            if (eventType === 'change') {
              ctx.presenter.write(`${safeColors.dim(`[${new Date().toLocaleTimeString()}]`)} ${safeColors.info('Config changed:')} ${path.basename(configPath)}\n`);
              await reloadManifests();
            }
          });
          watchers.set(configPath, watcher);
        } catch {
          // File doesn't exist
        }
      }
      
      ctx.presenter.write(`${safeSymbols.success} Watching ${watchedPaths.size} manifest file(s) and ${watchers.size - watchedPaths.size} config file(s)\n`);
      
      const stopWatching = () => {
        for (const watcher of watchers.values()) {
          watcher.close();
        }
        watchers.clear();
      };

      registerShutdownHook(() => {
        ctx.presenter.write(`\n${safeColors.dim('Stopping watch...')}\n`);
        stopWatching();
      });

      await new Promise(() => {}); // Never resolves
      
    } catch (err: any) {
      ctx.presenter.error(`Watch failed: ${err.message}`);
      return 1;
    }
  },
};

