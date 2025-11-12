/**
 * plugins:registry command - List all REST API plugin manifests
 */

import type { Command } from "../../types/types";
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { detectRepoRoot } from '@kb-labs/core-cli-adapters';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import { getContextCwd } from "@kb-labs/shared-cli-ui";

interface PluginManifestWithPath {
  manifest: ManifestV2;
  manifestPath: string;
  pluginRoot: string;
}

/**
 * Find REST API manifest path in a package
 */
async function findRestApiManifestPath(pkgRoot: string, pkg: any): Promise<string | null> {
  // Check package.json.kbLabs.manifest
  if (pkg.kbLabs?.manifest) {
    const manifestPath = path.isAbsolute(pkg.kbLabs.manifest)
      ? pkg.kbLabs.manifest
      : path.join(pkgRoot, pkg.kbLabs.manifest);
    try {
      await fs.access(manifestPath);
      return manifestPath;
    } catch {
      return null;
    }
  }

  // Check package.json.kb.manifest (alternative format)
  if (pkg.kb?.manifest) {
    const manifestPath = path.isAbsolute(pkg.kb.manifest)
      ? pkg.kb.manifest
      : path.join(pkgRoot, pkg.kb.manifest);
    try {
      await fs.access(manifestPath);
      return manifestPath;
    } catch {
      return null;
    }
  }

  // Check package.json.kbLabs.plugins array
  if (Array.isArray(pkg.kbLabs?.plugins)) {
    for (const pluginPath of pkg.kbLabs.plugins) {
      const manifestPath = path.isAbsolute(pluginPath)
        ? pluginPath
        : path.join(pkgRoot, pluginPath);
      try {
        await fs.access(manifestPath);
        return manifestPath;
      } catch {
        continue;
      }
    }
  }

  // Check package.json.kb.plugins array (alternative format)
  if (Array.isArray(pkg.kb?.plugins)) {
    for (const pluginPath of pkg.kb.plugins) {
      const manifestPath = path.isAbsolute(pluginPath)
        ? pluginPath
        : path.join(pkgRoot, pluginPath);
      try {
        await fs.access(manifestPath);
        return manifestPath;
      } catch {
        continue;
      }
    }
  }

  // Check .kblabs/plugins/ directory
  const pluginsDir = path.join(pkgRoot, '.kblabs', 'plugins');
  try {
    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        return path.join(pluginsDir, entry.name);
      }
    }
  } catch {
    // .kblabs/plugins/ doesn't exist
  }

  // Check conventional paths: dist/manifest.v2.js, dist/manifest.v2.ts
  const conventionalPaths = [
    path.join(pkgRoot, 'dist', 'manifest.v2.js'),
    path.join(pkgRoot, 'dist', 'manifest.v2.ts'),
    path.join(pkgRoot, 'src', 'manifest.v2.ts'),
    path.join(pkgRoot, 'manifest.v2.ts'),
    path.join(pkgRoot, 'manifest.v2.js'),
  ];

  for (const manifestPath of conventionalPaths) {
    try {
      await fs.access(manifestPath);
      return manifestPath;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Discover REST API plugins from workspace
 */
async function discoverRestApiPlugins(repoRoot: string): Promise<PluginManifestWithPath[]> {
  const results: PluginManifestWithPath[] = [];
  
  // Read pnpm-workspace.yaml
  const workspaceYaml = path.join(repoRoot, 'pnpm-workspace.yaml');
  let workspacePatterns: string[] = [];
  
  try {
    const content = await fs.readFile(workspaceYaml, 'utf8');
    const parsed = parseYaml(content) as { packages?: string[] };
    workspacePatterns = parsed.packages || [];
  } catch {
    // No workspace, try to discover from current directory
    workspacePatterns = ['packages/*', 'apps/*'];
  }

  // If no patterns found, try parent directories
  if (workspacePatterns.length === 0) {
    let currentDir = repoRoot;
    for (let i = 0; i < 3; i++) {
      const parentYaml = path.join(path.dirname(currentDir), 'pnpm-workspace.yaml');
      try {
        const content = await fs.readFile(parentYaml, 'utf8');
        const parsed = parseYaml(content) as { packages?: string[] };
        if (parsed.packages && parsed.packages.length > 0) {
          workspacePatterns = parsed.packages;
          repoRoot = path.dirname(currentDir);
          break;
        }
      } catch {
        // Continue searching
      }
      currentDir = path.dirname(currentDir);
      if (currentDir === path.dirname(currentDir)) {
        break; // Reached root
      }
    }
  }

  // Find all package.json files matching workspace patterns
  const packageJsonPaths: string[] = [];
  
  for (const pattern of workspacePatterns) {
    const pkgPattern = pattern.endsWith('/package.json')
      ? pattern
      : pattern.endsWith('/*')
      ? `${pattern}/package.json`
      : `${pattern}/**/package.json`;
    
    try {
      const matches = await glob(pkgPattern, {
        cwd: repoRoot,
        absolute: true,
        ignore: ['**/node_modules/**', '**/.kb/**'],
      });
      packageJsonPaths.push(...matches);
    } catch {
      // Pattern doesn't match, continue
    }
  }

  // Deduplicate package.json paths
  const uniquePaths = Array.from(new Set(packageJsonPaths));

  // Load manifests from each package
  for (const pkgJsonPath of uniquePaths) {
    const pkgRoot = path.dirname(pkgJsonPath);
    
    try {
      const pkgContent = await fs.readFile(pkgJsonPath, 'utf8');
      const pkg = JSON.parse(pkgContent);
      
      // Find manifest path
      const manifestPath = await findRestApiManifestPath(pkgRoot, pkg);
      if (!manifestPath) {
        continue;
      }

      // Load manifest
      try {
        const module = await import(manifestPath);
        const manifest: unknown = module.default || module.manifest || module;
        
        // Check if it's ManifestV2 with rest.routes
        if (
          manifest &&
          typeof manifest === 'object' &&
          'schema' in manifest &&
          manifest.schema === 'kb.plugin/2' &&
          'rest' in manifest &&
          manifest.rest &&
          typeof manifest.rest === 'object' &&
          'routes' in manifest.rest &&
          Array.isArray(manifest.rest.routes) &&
          manifest.rest.routes.length > 0
        ) {
          const manifestV2 = manifest as ManifestV2;
          results.push({
            manifest: manifestV2,
            manifestPath: path.resolve(manifestPath),
            pluginRoot: pkgRoot,
          });
        }
      } catch (e) {
        // Failed to load manifest, skip
        continue;
      }
    } catch {
      // Failed to read package.json, skip
      continue;
    }
  }

  return results;
}

export const pluginsRegistry: Command = {
  name: "plugins:registry",
  category: "system",
  describe: "List all REST API plugin manifests for REST API server",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb plugins:registry",
    "kb plugins:registry --json",
  ],

  async run(ctx, argv, flags) {
    const jsonMode = !!flags.json;
    
    try {
      const cwd = getContextCwd(ctx);
      const repoRoot = ctx.repoRoot || detectRepoRoot(cwd);
      
      // Discover REST API plugins from workspace
      const restApiPlugins = await discoverRestApiPlugins(repoRoot);
      
      const manifests = restApiPlugins;
      const manifestsWithPaths = manifests.map(p => ({
        manifest: p.manifest,
        manifestPath: p.manifestPath,
        pluginRoot: p.pluginRoot,
      }));

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          manifests: manifests.map(p => p.manifest),
          manifestsWithPaths,
          total: manifests.length,
        });
        return 0;
      }

      // Text output
      ctx.presenter.info(`Found ${manifests.length} REST API plugin(s):`);
      for (const plugin of manifests) {
        const displayName = plugin.manifest.display?.name || plugin.manifest.id;
        ctx.presenter.info(`  ${plugin.manifest.id}@${plugin.manifest.version} - ${displayName}`);
        ctx.presenter.info(`    Path: ${plugin.manifestPath}`);
        ctx.presenter.info(`    Routes: ${plugin.manifest.rest?.routes?.length || 0}`);
      }

      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};
