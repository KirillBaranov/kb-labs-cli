/**
 * @kb-labs/cli-commands/registry
 * Command manifest discovery - workspace, node_modules, current package
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import type { CommandManifest, DiscoveryResult, CacheFile } from './types.js';
import { log } from '../utils/logger.js';
import { toPosixPath } from '../utils/path.js';

const MANIFEST_LOAD_TIMEOUT = 1500; // ms

/**
 * Load manifest with timeout protection
 */
async function loadManifestWithTimeout(manifestPath: string, pkgName: string): Promise<CommandManifest[]> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), MANIFEST_LOAD_TIMEOUT);
  });
  
  try {
    return await Promise.race([loadManifest(manifestPath), timeout]);
  } catch (err: any) {
    if (err.message === 'Timeout') {
      log('warn', `Timeout loading manifest from ${pkgName}`);
      return [];
    }
    throw err;
  }
}

/**
 * Load manifest - tries ESM first, falls back to CJS
 */
async function loadManifest(manifestPath: string): Promise<CommandManifest[]> {
  // Try ESM first
  try {
    const fileUrl = pathToFileURL(manifestPath).href;
    const mod = await import(fileUrl);
    return mod.commands || mod.default || [];
  } catch (err: any) {
    // Don't fallback to require() if it's an ES module - require will fail
    // Only try require for .cjs files or if it's truly not an ESM module
    if (err.code === 'ERR_MODULE_NOT_FOUND' || manifestPath.endsWith('.cjs')) {
      try {
        const req = createRequire(import.meta.url);
        const mod = req(manifestPath);
        return mod.commands || mod.default || [];
      } catch (requireErr: any) {
        // If require fails on ES Module, re-throw the original import error
        if (requireErr.message.includes('Cannot require() ES Module')) {
          throw err;
        }
        throw requireErr;
      }
    }
    throw err;
  }
}

/**
 * Read and parse package.json
 */
async function readPackageJson(pkgPath: string): Promise<any> {
  try {
    const content = await fs.readFile(pkgPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Validate that command IDs and aliases are unique within a package
 */
function validateUniqueIds(manifests: CommandManifest[], pkgName: string): void {
  const ids = new Set<string>();
  const aliases = new Set<string>();
  
  for (const m of manifests) {
    if (ids.has(m.id)) {
      throw new Error(`Duplicate command ID "${m.id}" in package ${pkgName}`);
    }
    ids.add(m.id);
    
    if (m.aliases) {
      for (const alias of m.aliases) {
        if (aliases.has(alias) || ids.has(alias)) {
          throw new Error(`Alias collision "${alias}" in package ${pkgName}`);
        }
        aliases.add(alias);
      }
    }
  }
}

/**
 * Discover commands from workspace packages
 */
async function discoverWorkspace(cwd: string): Promise<DiscoveryResult[]> {
  const workspaceYaml = path.join(cwd, 'pnpm-workspace.yaml');
  const content = await fs.readFile(workspaceYaml, 'utf8');
  const parsed = parseYaml(content) as { packages: string[] };
  
  if (!parsed.packages || !Array.isArray(parsed.packages)) {
    throw new Error('Invalid pnpm-workspace.yaml: missing packages array');
  }
  
  const results: DiscoveryResult[] = [];
  
  for (const pattern of parsed.packages) {
    const pkgDirs = await glob(pattern, { cwd, absolute: false });
    
    for (const dir of pkgDirs) {
      const pkgRoot = path.join(cwd, dir);
      const pkg = await readPackageJson(path.join(pkgRoot, 'package.json'));
      
      if (pkg?.kb?.commandsManifest) {
        const manifestPath = path.join(pkgRoot, pkg.kb.commandsManifest);
        try {
          const manifests = await loadManifestWithTimeout(manifestPath, pkg.name);
          if (manifests.length > 0) {
            validateUniqueIds(manifests, pkg.name);
            results.push({
              manifests,
              source: 'workspace',
              packageName: pkg.name,
              manifestPath: toPosixPath(manifestPath),
              pkgRoot: toPosixPath(pkgRoot),
            });
          }
        } catch (err: any) {
          // Skip if cannot require ES Module - this happens when trying to require() an ESM file
          // The manifest will be loaded as an ESM module in a normal workflow
          if (err.message.includes('Cannot require() ES Module')) {
            log('debug', `Skipping ESM manifest from ${pkg.name}: ${err.message}`);
          } else {
            log('warn', `Failed to load manifest from ${pkg.name}: ${err.message}`);
          }
        }
      }
    }
  }
  
  return results;
}

/**
 * Discover commands from current package (fallback when no workspace)
 */
async function discoverCurrentPackage(cwd: string): Promise<DiscoveryResult | null> {
  try {
    const pkg = await readPackageJson(path.join(cwd, 'package.json'));
    if (pkg?.kb?.commandsManifest) {
      const manifestPath = path.join(cwd, pkg.kb.commandsManifest);
      const manifests = await loadManifestWithTimeout(manifestPath, pkg.name);
      if (manifests.length > 0) {
        validateUniqueIds(manifests, pkg.name);
        return {
          manifests,
          source: 'workspace',
          packageName: pkg.name,
          manifestPath: toPosixPath(manifestPath),
          pkgRoot: toPosixPath(cwd),
        };
      }
    }
  } catch (err: any) {
    log('debug', `No CLI manifest in current package: ${err.message}`);
  }
  return null;
}

/**
 * Discover commands from node_modules/@kb-labs/*
 */
async function discoverNodeModules(cwd: string): Promise<DiscoveryResult[]> {
  const nmDir = path.join(cwd, 'node_modules', '@kb-labs');
  
  try {
    const dirs = await fs.readdir(nmDir, { withFileTypes: true });
    const results: DiscoveryResult[] = [];
    
    for (const dir of dirs.filter(d => d.isDirectory())) {
      const pkgRoot = path.join(nmDir, dir.name);
      const pkg = await readPackageJson(path.join(pkgRoot, 'package.json'));
      
      if (pkg?.kb?.commandsManifest) {
        const manifestPath = path.join(pkgRoot, pkg.kb.commandsManifest);
        try {
          const manifests = await loadManifestWithTimeout(manifestPath, pkg.name);
          if (manifests.length > 0) {
            validateUniqueIds(manifests, pkg.name);
            results.push({
              manifests,
              source: 'node_modules',
              packageName: pkg.name,
              manifestPath: toPosixPath(manifestPath),
              pkgRoot: toPosixPath(pkgRoot),
            });
          }
        } catch (err: any) {
          log('warn', `Failed to load manifest from ${pkg.name}: ${err.message}`);
        }
      }
    }
    
    return results;
  } catch {
    return [];
  }
}

/**
 * Deduplicate manifests (workspace > node_modules)
 */
function deduplicateManifests(all: DiscoveryResult[]): DiscoveryResult[] {
  const byId = new Map<string, DiscoveryResult>();
  
  for (const result of all) {
    for (const manifest of result.manifests) {
      const existing = byId.get(manifest.id);
      if (existing) {
        // Workspace wins over node_modules
        if (result.source === 'workspace' && existing.source === 'node_modules') {
          byId.set(manifest.id, result);
        }
      } else {
        byId.set(manifest.id, result);
      }
    }
  }
  
  return Array.from(byId.values());
}

/**
 * Load cache file
 */
async function loadCache(cwd: string): Promise<CacheFile | null> {
  const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
  
  try {
    const content = await fs.readFile(cachePath, 'utf8');
    const cache = JSON.parse(content) as CacheFile;
    
    // Validate version compatibility
    if (cache.version !== process.version) {
      log('debug', 'Cache invalidated: Node version changed');
      return null;
    }
    
    const currentCliVersion = process.env.CLI_VERSION || '0.1.0';
    if (cache.cliVersion !== currentCliVersion) {
      log('debug', 'Cache invalidated: CLI version changed');
      return null;
    }
    
    return cache;
  } catch {
    return null; // Cache doesn't exist or is corrupt
  }
}

/**
 * Check if cache is stale
 */
function isCacheStale(cache: CacheFile, cwd: string): boolean {
  const now = Date.now();
  
  // TTL: 60 seconds
  if (now - cache.timestamp > 60_000) {
    log('debug', 'Cache expired (TTL)');
    return true;
  }
  
  // Check all tracked files
  for (const [filePath, oldMtime] of Object.entries(cache.mtimes)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs > oldMtime) {
        log('debug', `Cache invalidated: ${filePath} changed`);
        return true;
      }
    } catch {
      log('debug', `Cache invalidated: ${filePath} deleted`);
      return true;
    }
  }
  
  return false;
}

/**
 * Save cache file
 */
async function saveCache(cwd: string, results: DiscoveryResult[]): Promise<void> {
  const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  
  const mtimes: Record<string, number> = {};
  
  // Track workspace file
  const workspaceYaml = path.join(cwd, 'pnpm-workspace.yaml');
  try {
    const stat = await fs.stat(workspaceYaml);
    mtimes[toPosixPath(workspaceYaml)] = stat.mtimeMs;
  } catch {}
  
  // Track root package.json
  const rootPkg = path.join(cwd, 'package.json');
  try {
    const stat = await fs.stat(rootPkg);
    mtimes[toPosixPath(rootPkg)] = stat.mtimeMs;
  } catch {}
  
  // Track pnpm modules metadata
  const pnpmModules = path.join(cwd, 'node_modules', '.modules.yaml');
  try {
    const stat = await fs.stat(pnpmModules);
    mtimes[toPosixPath(pnpmModules)] = stat.mtimeMs;
  } catch {}
  
  // Track each manifest and package.json
  for (const result of results) {
    try {
      // Convert back to native path for fs operations
      const nativeManifestPath = result.manifestPath.split('/').join(path.sep);
      const stat = await fs.stat(nativeManifestPath);
      mtimes[result.manifestPath] = stat.mtimeMs;
      
      const pkgJsonPath = path.join(result.pkgRoot.split('/').join(path.sep), 'package.json');
      const pkgStat = await fs.stat(pkgJsonPath);
      mtimes[toPosixPath(pkgJsonPath)] = pkgStat.mtimeMs;
    } catch (err: any) {
      log('debug', `Failed to track mtime for ${result.manifestPath}: ${err.message}`);
    }
  }
  
  const cache: CacheFile = {
    version: process.version,
    cliVersion: process.env.CLI_VERSION || '0.1.0',
    timestamp: Date.now(),
    mtimes,
    results,
  };
  
  try {
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err: any) {
    log('debug', `Failed to save cache: ${err.message}`);
  }
}

/**
 * Main discovery function
 * Discovers command manifests from workspace, current package, and node_modules
 */
export async function discoverManifests(cwd: string, noCache = false): Promise<DiscoveryResult[]> {
  // Check cache first
  if (!noCache) {
    const cached = await loadCache(cwd);
    if (cached && !isCacheStale(cached, cwd)) {
      log('debug', 'Using cached manifests');
      return cached.results;
    }
  }
  
  // Try workspace first
  let workspace: DiscoveryResult[] = [];
  try {
    workspace = await discoverWorkspace(cwd);
    log('info', `Discovered ${workspace.length} workspace packages with CLI manifests`);
  } catch (err: any) {
    // No pnpm-workspace.yaml - fallback to current package + node_modules
    log('info', 'No workspace file found, checking current package');
    
    const currentPkg = await discoverCurrentPackage(cwd);
    if (currentPkg) {
      workspace = [currentPkg];
      log('info', `Discovered current package with CLI manifest: ${currentPkg.packageName}`);
    }
  }
  
  // Discover from node_modules
  const installed = await discoverNodeModules(cwd);
  if (installed.length > 0) {
    log('info', `Discovered ${installed.length} installed packages with CLI manifests`);
  }
  
  // Deduplicate
  const results = deduplicateManifests([...workspace, ...installed]);
  
  // Save cache
  await saveCache(cwd, results);
  
  return results;
}

