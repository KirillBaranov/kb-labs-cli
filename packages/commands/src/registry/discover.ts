/**
 * @kb-labs/cli-commands/registry
 * Command manifest discovery - workspace, node_modules, current package
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import type { CommandManifest, DiscoveryResult, CacheFile, PackageCacheEntry } from './types.js';
import { log } from '../utils/logger.js';
import { toPosixPath } from '../utils/path.js';

// Constants
const MANIFEST_LOAD_TIMEOUT = 1500; // 1.5 seconds

/**
 * Compute SHA256 hash of manifest file content
 */
async function computeManifestHash(manifestPath: string): Promise<string> {
  try {
    const content = await fs.readFile(manifestPath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return 'unknown';
  }
}

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
 * Discover commands from workspace packages with parallel loading
 */
async function discoverWorkspace(cwd: string): Promise<DiscoveryResult[]> {
  const workspaceYaml = path.join(cwd, 'pnpm-workspace.yaml');
  const content = await fs.readFile(workspaceYaml, 'utf8');
  const parsed = parseYaml(content) as { packages: string[] };
  
  if (!parsed.packages || !Array.isArray(parsed.packages)) {
    throw new Error('Invalid pnpm-workspace.yaml: missing packages array');
  }
  
  // First pass: collect all package info
  const packageInfos: Array<{pkgRoot: string, pkg: any, manifestPath: string}> = [];
  
  for (const pattern of parsed.packages) {
    const pkgDirs = await glob(pattern, { 
      cwd, 
      absolute: false,
      ignore: ['.kb/**', 'node_modules/**', '**/node_modules/**'] // Ignore .kb, node_modules
    });
    
    for (const dir of pkgDirs) {
      const pkgRoot = path.join(cwd, dir);
      const pkg = await readPackageJson(path.join(pkgRoot, 'package.json'));
      
      if (pkg?.kb?.commandsManifest) {
        const manifestPath = path.join(pkgRoot, pkg.kb.commandsManifest);
        packageInfos.push({ pkgRoot, pkg, manifestPath });
      }
    }
  }
  
  // Second pass: load all manifests in parallel
  const loadPromises = packageInfos.map(async ({ pkgRoot, pkg, manifestPath }) => {
    try {
      const manifests = await loadManifestWithTimeout(manifestPath, pkg.name);
      if (manifests.length > 0) {
        validateUniqueIds(manifests, pkg.name);
        return {
          manifests,
          source: 'workspace' as const,
          packageName: pkg.name,
          manifestPath: toPosixPath(manifestPath),
          pkgRoot: toPosixPath(pkgRoot),
        };
      }
      return null;
    } catch (err: any) {
      // Skip if cannot require ES Module - this happens when trying to require() an ESM file
      // The manifest will be loaded as an ESM module in a normal workflow
      if (err.message.includes('Cannot require() ES Module')) {
        log('debug', `Skipping ESM manifest from ${pkg.name}: ${err.message}`);
      } else {
        log('warn', JSON.stringify({
          code: 'DISCOVERY_MANIFEST_LOAD_FAIL',
          packageName: pkg.name,
          manifestPath: toPosixPath(manifestPath),
          errorCode: err.code || 'UNKNOWN',
          errorMessage: err.message,
          hint: err.message.includes('Cannot find package') 
            ? 'Run: kb devlink apply && pnpm -w build'
            : 'Check manifest syntax and dependencies'
        }));
      }
      return null;
    }
  });
  
  const settledResults = await Promise.allSettled(loadPromises);
  const results: DiscoveryResult[] = [];
  
  for (const settled of settledResults) {
    if (settled.status === 'fulfilled' && settled.value) {
      results.push(settled.value);
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
 * Discover commands from node_modules/@kb-labs/* with parallel loading
 */
async function discoverNodeModules(cwd: string): Promise<DiscoveryResult[]> {
  const nmDir = path.join(cwd, 'node_modules', '@kb-labs');
  
  try {
    const dirs = await fs.readdir(nmDir, { withFileTypes: true });
    
    // First pass: collect all package info
    const packageInfos: Array<{pkgRoot: string, pkg: any, manifestPath: string}> = [];
    
    for (const dir of dirs.filter(d => d.isDirectory())) {
      const pkgRoot = path.join(nmDir, dir.name);
      const pkg = await readPackageJson(path.join(pkgRoot, 'package.json'));
      
      if (pkg?.kb?.commandsManifest) {
        const manifestPath = path.join(pkgRoot, pkg.kb.commandsManifest);
        packageInfos.push({ pkgRoot, pkg, manifestPath });
      }
    }
    
    // Second pass: load all manifests in parallel
    const loadPromises = packageInfos.map(async ({ pkgRoot, pkg, manifestPath }) => {
      try {
        const manifests = await loadManifestWithTimeout(manifestPath, pkg.name);
        if (manifests.length > 0) {
          validateUniqueIds(manifests, pkg.name);
          return {
            manifests,
            source: 'node_modules' as const,
            packageName: pkg.name,
            manifestPath: toPosixPath(manifestPath),
            pkgRoot: toPosixPath(pkgRoot),
          };
        }
        return null;
      } catch (err: any) {
        log('warn', JSON.stringify({
          code: 'DISCOVERY_MANIFEST_LOAD_FAIL',
          packageName: pkg.name,
          manifestPath: toPosixPath(manifestPath),
          errorCode: err.code || 'UNKNOWN',
          errorMessage: err.message,
          hint: err.message.includes('Cannot find package') 
            ? 'Run: kb devlink apply && pnpm -w build'
            : 'Check manifest syntax and dependencies'
        }));
        return null;
      }
    });
    
    const settledResults = await Promise.allSettled(loadPromises);
    const results: DiscoveryResult[] = [];
    
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled' && settled.value) {
        results.push(settled.value);
      }
    }
    
    return results;
  } catch {
    return [];
  }
}

/**
 * Deduplicate manifests (workspace > node_modules)
 * Also deduplicate by package path to avoid duplicate workspace packages
 */
function deduplicateManifests(all: DiscoveryResult[]): DiscoveryResult[] {
  const byPackageName = new Map<string, DiscoveryResult>();
  
  // First, deduplicate by package name (keeping only one version of each package)
  for (const result of all) {
    const existing = byPackageName.get(result.packageName);
    if (!existing) {
      byPackageName.set(result.packageName, result);
    } else if (result.source === 'workspace' && existing.source !== 'workspace') {
      // Workspace wins over node_modules
      byPackageName.set(result.packageName, result);
    }
  }
  
  return Array.from(byPackageName.values());
}

/**
 * Load cache file
 */
async function loadCache(cwd: string): Promise<CacheFile | null> {
  const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
  
  try {
    const content = await fs.readFile(cachePath, 'utf8');
    const cache = JSON.parse(content) as any;
    
    // Handle old cache format (with mtimes and results)
    if (cache.mtimes && cache.results) {
      log('debug', 'Old cache format detected, ignoring');
      return null;
    }
    
    // Validate new cache format
    if (!cache.packages) {
      log('debug', 'Invalid cache format, ignoring');
      return null;
    }
    
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
    
    return cache as CacheFile;
  } catch {
    return null; // Cache doesn't exist or is corrupt
  }
}

/**
 * Check if cache is stale for a specific package
 */
function isPackageCacheStale(entry: PackageCacheEntry): boolean {
  const now = Date.now();
  
  // TTL: 60 seconds (skip TTL check for builtin commands)
  const cacheAge = entry.result.source === 'builtin' ? 0 : now - entry.pkgJsonMtime;
  if (cacheAge > 60_000) {
    log('debug', 'Package cache expired (TTL)');
    return true;
  }
  
  // Check manifest file mtime
  try {
    const stat = statSync(entry.manifestPath);
    if (stat.mtimeMs > entry.manifestMtime) {
      log('debug', `Package cache invalidated: ${entry.manifestPath} changed`);
      return true;
    }
  } catch {
    log('debug', `Package cache invalidated: ${entry.manifestPath} deleted`);
    return true;
  }
  
  return false;
}

/**
 * Save cache file with per-package structure
 */
async function saveCache(cwd: string, results: DiscoveryResult[]): Promise<void> {
  const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  
  const packages: Record<string, PackageCacheEntry> = {};
  
  // Process each result into package cache entries
  for (const result of results) {
    try {
      const manifestHash = await computeManifestHash(result.manifestPath);
      
      // Get package.json mtime
      const pkgJsonPath = path.join(result.pkgRoot.split('/').join(path.sep), 'package.json');
      const pkgStat = await fs.stat(pkgJsonPath);
      
      // Get manifest mtime
      const manifestStat = await fs.stat(result.manifestPath.split('/').join(path.sep));
      
      packages[result.packageName] = {
        version: '0.1.0', // TODO: Extract from package.json
        manifestHash,
        manifestPath: result.manifestPath,
        pkgJsonMtime: pkgStat.mtimeMs,
        manifestMtime: manifestStat.mtimeMs,
        result,
      };
    } catch (err: any) {
      log('debug', `Failed to cache package ${result.packageName}: ${err.message}`);
    }
  }
  
  const cache: CacheFile = {
    version: process.version,
    cliVersion: process.env.CLI_VERSION || '0.1.0',
    timestamp: Date.now(),
    packages,
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
    if (cached) {
      log('debug', 'Using cached manifests');
      // Filter out stale packages and return fresh ones
      const freshResults: DiscoveryResult[] = [];
      for (const [pkgName, entry] of Object.entries(cached.packages)) {
        if (!isPackageCacheStale(entry)) {
          freshResults.push(entry.result);
        }
      }
      if (freshResults.length > 0) {
        return freshResults;
      }
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

