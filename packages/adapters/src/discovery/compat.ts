/**
 * @module @kb-labs/cli-adapters/discovery/compat
 * Compatibility adapter for v1 and v2 manifests
 */

import type { PluginDiscovery } from '@kb-labs/cli-core';
import type { CliCommand } from '@kb-labs/cli-core';
import type { ManifestV1, ManifestV2 } from '@kb-labs/plugin-manifest';
import {
  detectManifestVersion,
  checkDualManifest,
  migrateV1ToV2,
} from '@kb-labs/plugin-manifest';
import { registerCommands } from '@kb-labs/plugin-adapter-cli';
import { getDeprecationWarning } from '@kb-labs/plugin-manifest';
import { CliError, CLI_ERROR_CODES } from '@kb-labs/cli-core';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

/**
 * Plugin discovery result
 */
interface DiscoveredPlugin {
  /** Package name */
  packageName: string;
  /** Manifest version */
  version: 'v1' | 'v2';
  /** Manifest data */
  manifest: ManifestV1 | ManifestV2;
  /** Warning message if any */
  warning?: string;
}

/**
 * Discovery order:
 * 1. package.json.kbLabs.manifest
 * 2. .kblabs/plugins/
 * 3. Auto-discovery
 */
export async function discoverPlugins(
  startDir = process.cwd()
): Promise<DiscoveredPlugin[]> {
  const plugins: DiscoveredPlugin[] = [];

  // 1. Check package.json.kbLabs.manifest
  const pkgPath = await findNearestPackageJson(startDir);
  if (pkgPath) {
    try {
      const raw = await fsp.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as any;
      const manifestPath = pkg?.kbLabs?.manifest;
      if (manifestPath) {
        const plugin = await loadPlugin(manifestPath, path.dirname(pkgPath));
        if (plugin) {
          plugins.push(plugin);
        }
      }

      // Also check kbLabs.plugins array (for multiple plugins)
      const pluginsList = pkg?.kbLabs?.plugins;
      if (Array.isArray(pluginsList)) {
        for (const pluginPath of pluginsList) {
          const plugin = await loadPlugin(pluginPath, path.dirname(pkgPath));
          if (plugin) {
            plugins.push(plugin);
          }
        }
      }
    } catch (e) {
      // Ignore package.json errors
    }
  }

  // 2. Check .kblabs/plugins/ directory
  const pluginsDir = path.join(startDir, '.kblabs', 'plugins');
  try {
    const entries = await fsp.readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        const pluginPath = path.join(pluginsDir, entry.name);
        const plugin = await loadPlugin(pluginPath, startDir);
        if (plugin) {
          plugins.push(plugin);
        }
      }
    }
  } catch {
    // .kblabs/plugins/ doesn't exist
  }

  // 3. Auto-discovery would scan node_modules (optional, not implemented yet)

  return plugins;
}

/**
 * Load plugin from path
 */
async function loadPlugin(
  pluginPath: string,
  baseDir: string
): Promise<DiscoveredPlugin | null> {
  try {
    const resolvedPath = path.isAbsolute(pluginPath)
      ? pluginPath
      : path.join(baseDir, pluginPath);

    // Try to load module
    const module = await import(resolvedPath);
    const manifest: unknown = module.default || module.manifest || module;

    // Detect version
    const version = detectManifestVersion(manifest);

    if (version === 'unknown') {
      // Try to load as v1 commands array
      const commands = module.commands || module.default;
      if (Array.isArray(commands)) {
        // Legacy v1 format with commands array
        const v1Manifest: ManifestV1 = {
          manifestVersion: '1.0',
          commands: commands as any,
        };
        return {
          packageName: path.basename(resolvedPath, path.extname(resolvedPath)),
          version: 'v1',
          manifest: v1Manifest,
          warning: getDeprecationWarning(path.basename(resolvedPath)),
        };
      }
      return null;
    }

    if (version === 'v1') {
      return {
        packageName: path.basename(resolvedPath, path.extname(resolvedPath)),
        version: 'v1',
        manifest: manifest as ManifestV1,
        warning: getDeprecationWarning(path.basename(resolvedPath)),
      };
    }

    if (version === 'v2') {
      return {
        packageName: path.basename(resolvedPath, path.extname(resolvedPath)),
        version: 'v2',
        manifest: manifest as ManifestV2,
      };
    }

    return null;
  } catch (e) {
    // Ignore load errors
    return null;
  }
}

/**
 * Find nearest package.json
 */
async function findNearestPackageJson(dir: string): Promise<string | null> {
  let cur = path.resolve(dir);
  while (true) {
    const cand = path.join(cur, 'package.json');
    try {
      await fsp.access(cand);
      return cand;
    } catch {}
    const parent = path.dirname(cur);
    if (parent === cur) {
      return null;
    }
    cur = parent;
  }
}

/**
 * Compatibility adapter that loads both v1 and v2 manifests
 */
export function createCompatibilityDiscovery(
  startDir = process.cwd()
): PluginDiscovery {
  return {
    async find() {
      const plugins = await discoverPlugins(startDir);
      
      // Group by package name to detect dual manifests
      const pluginMap = new Map<string, DiscoveredPlugin[]>();
      for (const plugin of plugins) {
        if (!pluginMap.has(plugin.packageName)) {
          pluginMap.set(plugin.packageName, []);
        }
        pluginMap.get(plugin.packageName)!.push(plugin);
      }

      // Check for dual manifests and prefer v2
      const result: string[] = [];
      for (const [packageName, pluginList] of pluginMap.entries()) {
        const v1Plugin = pluginList.find((p) => p.version === 'v1');
        const v2Plugin = pluginList.find((p) => p.version === 'v2');

        if (v1Plugin && v2Plugin) {
          // Both v1 and v2 exist - prefer v2, warn about v1
          const check = checkDualManifest(
            v1Plugin.manifest as ManifestV1,
            v2Plugin.manifest as ManifestV2,
            packageName
          );
          if (check.warning) {
            console.warn(check.warning);
          }
          result.push(`v2:${packageName}`);
        } else if (v2Plugin) {
          result.push(`v2:${packageName}`);
        } else if (v1Plugin) {
          result.push(`v1:${packageName}`);
        }
      }

      return result;
    },
    async load(ref: string) {
      const [version, packageName] = ref.split(':');
      const plugins = await discoverPlugins(startDir);
      const plugin = plugins.find((p) => p.packageName === packageName && p.version === version);

      if (!plugin) {
        throw new CliError(
          CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
          `Plugin ${packageName} (${version}) not found`
        );
      }

      // Load v2 manifest
      if (plugin.version === 'v2') {
        const commands: CliCommand[] = [];
        await registerCommands(
          plugin.manifest as ManifestV2,
          commands,
          {
            grantedCapabilities: [],
            exitPolicy: 'major',
            debug: process.env.DEBUG === '1',
            getContext: async () => {
              const { createContext, createTextPresenter } = await import('@kb-labs/cli-core');
              return createContext({ presenter: createTextPresenter() });
            },
          }
        );
        return commands;
      }

      // Load v1 manifest (legacy)
      if (plugin.version === 'v1') {
        const v1Manifest = plugin.manifest as ManifestV1;
        
        // Migrate v1 to v2 and register
        const v2Manifest = migrateV1ToV2(v1Manifest);
        const commands: CliCommand[] = [];
        await registerCommands(
          v2Manifest,
          commands,
          {
            grantedCapabilities: [],
            exitPolicy: 'major',
            debug: false,
            getContext: async () => {
              const { createContext, createTextPresenter } = await import('@kb-labs/cli-core');
              return createContext({ presenter: createTextPresenter() });
            },
          }
        );
        return commands;
      }

      return [];
    },
  };
}
