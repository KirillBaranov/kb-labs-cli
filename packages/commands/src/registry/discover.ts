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
import type { CommandManifest, DiscoveryResult, CacheFile, PackageCacheEntry } from './types';
import { log } from '../utils/logger';
import { toPosixPath } from '../utils/path';
import { telemetry } from './telemetry';
import { validateManifests, normalizeManifest, getManifestVersion, isManifestVersionSupported } from './schema';

/** Create a synthetic manifest marking package as unavailable with actionable hint */
function createUnavailableManifest(pkgName: string, error: any): CommandManifest {
  const rawMsg = (error?.message || String(error) || '').toString();
  // Try to extract missing module name from error
  let missing: string | null = null;
  const m1 = rawMsg.match(/Cannot find (?:module|package) '([^']+)'/);
  const m2 = rawMsg.match(/from ['"]([^'"]+)['"]/);
  if (m1 && m1[1]) {missing = m1[1];}
  else if (m2 && m2[1] && m2[1].startsWith('@')) {missing = m2[1];}

  // Derive group from package name (e.g., @kb-labs/core-cli -> core)
  const seg = pkgName.includes('/') ? pkgName.split('/')[1] : pkgName;
  const group = (seg || pkgName).replace(/-cli$/,'');
  const short = seg || pkgName;

  const requires = missing ? [missing] : [];

  const manifest: CommandManifest = {
    manifestVersion: '1.0',
    id: `${group}:manifest:${short}`,
    group,
    describe: `Commands from ${pkgName} are unavailable` ,
    requires,
    loader: async () => {
      // Throw a descriptive error if someone tries to run it
      const err = new Error(`Cannot load ${pkgName} CLI manifest. ${rawMsg}`);
      throw err;
    }
  } as any;
  return manifest;
}

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
 * Compute hash of lockfile (pnpm-lock.yaml) for cache invalidation
 */
async function computeLockfileHash(cwd: string): Promise<string> {
  const lockfilePath = path.join(cwd, 'pnpm-lock.yaml');
  try {
    const content = await fs.readFile(lockfilePath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Compute hash of kb-labs.config.json for cache invalidation
 */
async function computeConfigHash(cwd: string): Promise<string> {
  const configPath = path.join(cwd, 'kb-labs.config.json');
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Compute hash of .kb/plugins.json for cache invalidation
 */
async function computePluginsStateHash(cwd: string): Promise<string> {
  const pluginsPath = path.join(cwd, '.kb', 'plugins.json');
  try {
    const content = await fs.readFile(pluginsPath, 'utf8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Load manifest with timeout protection
 */
async function loadManifestWithTimeout(manifestPath: string, pkgName: string, pkgRoot?: string): Promise<CommandManifest[]> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), MANIFEST_LOAD_TIMEOUT);
  });
  
  try {
    return await Promise.race([loadManifest(manifestPath, pkgName, pkgRoot), timeout]);
  } catch (err: any) {
    if (err.message === 'Timeout') {
      log('warn', `Timeout loading manifest from ${pkgName}`);
      return [];
    }
    throw err;
  }
}

/**
 * Derive namespace from package name
 */
function deriveNamespace(packageName: string): string {
  // Extract namespace from package name
  // @kb-labs/devlink-cli -> devlink
  // @scope/name-cli -> name
  const parts = packageName.split('/');
  const lastPart = parts[parts.length - 1] || packageName;
  return lastPart.replace(/-cli$/, '').replace(/^kb-labs-/, '');
}

/**
 * Load manifest - tries ESM first, falls back to CJS
 * Validates and normalizes manifests according to schema
 * Supports both v1.0 (CommandManifest[]) and v2 (ManifestV2) formats
 */
async function loadManifest(manifestPath: string, pkgName: string, pkgRoot?: string): Promise<CommandManifest[]> {
  // Always prefer dynamic import for manifests (supports ESM)
  const fileUrl = pathToFileURL(manifestPath).href;
  const mod = await import(fileUrl);
  
  // Check if this is a ManifestV2 (schema: 'kb.plugin/2')
  const manifestV2 = (mod as any).manifest || (mod as any).default;
  if (manifestV2 && typeof manifestV2 === 'object' && manifestV2.schema === 'kb.plugin/2') {
    // This is a ManifestV2 - extract CLI commands
    if (!manifestV2.cli?.commands || !Array.isArray(manifestV2.cli.commands)) {
      log('warn', `ManifestV2 ${manifestV2.id || pkgName} has no CLI commands`);
      return [];
    }
    
    // Convert ManifestV2 CLI commands to CommandManifest format
    const namespace = deriveNamespace(pkgName);
    const manifestDir = path.dirname(manifestPath);
    const baseRoot = pkgRoot || manifestDir;
    
    const commandManifests: CommandManifest[] = manifestV2.cli.commands.map((cmd: any) => {
      // Convert v2 command to v1.0 CommandManifest format
      const commandId = cmd.id.includes(':') ? cmd.id : `${cmd.group || namespace}:${cmd.id}`;
      
      // For ManifestV2 commands, loader is not used - execution happens via plugin-adapter-cli
      // Create a placeholder loader that won't be called (runCommand skips loader for ManifestV2)
      const loader: () => Promise<{ run: any }> = async () => {
        // This should never be called for ManifestV2 commands
        // runCommand checks for manifestV2 and skips loader
        throw new Error(`Loader should not be called for ManifestV2 command ${commandId}. Use plugin-adapter-cli executeCommand instead.`);
      };
      
      // Ensure manifestV2 is preserved in the command manifest
      const commandManifest: CommandManifest = {
        manifestVersion: '1.0' as const,
        id: commandId,
        group: cmd.group || namespace,
        describe: cmd.describe || '',
        longDescription: cmd.longDescription,
        aliases: cmd.aliases,
        flags: cmd.flags,
        examples: cmd.examples,
        loader,
        package: pkgName,
        namespace: cmd.group || namespace,
      };
      
      // Explicitly set manifestV2 after creation to ensure it's preserved
      (commandManifest as any).manifestV2 = manifestV2;
      
      return commandManifest;
    });
    
    // Validate converted manifests
    const validation = validateManifests(commandManifests);
    if (!validation.success) {
      const errorMessages = validation.errors.map(err => 
        err.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
      ).join('; ');
      log('warn', `ManifestV2 validation warnings for ${pkgName}: ${errorMessages}`);
      // Continue anyway - some fields might be optional
    }
    
    // Normalize manifests
    const normalized = (validation.success ? validation.data : commandManifests).map(m => 
      normalizeManifest(m, pkgName, namespace)
    );
    
    return normalized;
  }
  
  // Legacy v1.0 format - expect array of commands
  const rawManifests = (mod as any).commands || (mod as any).default || [];
  
  if (!Array.isArray(rawManifests)) {
    throw new Error(`Manifest must export an array of commands or ManifestV2 object, got ${typeof rawManifests}`);
  }
  
  // Check manifest version first
  for (const manifest of rawManifests) {
    const version = getManifestVersion(manifest);
    if (version && !isManifestVersionSupported(version)) {
      log('warn', `Manifest version ${version} is not supported. Expected 1.0`);
      log('warn', `  → Plugin ${pkgName} may not work correctly. Check for updates.`);
    }
  }
  
  // Validate all manifests
  const validation = validateManifests(rawManifests);
  if (!validation.success) {
    const errorMessages = validation.errors.map(err => 
      err.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
    ).join('; ');
    throw new Error(`Manifest validation failed for ${pkgName}: ${errorMessages}`);
  }
  
  // Normalize manifests
  const namespace = deriveNamespace(pkgName);
  const normalized = validation.data.map(m => normalizeManifest(m, pkgName, namespace));
  
  return normalized;
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
 * Load kb-labs.config.json with plugins allowlist/blocklist
 */
async function loadConfig(cwd: string): Promise<{ allow?: string[]; block?: string[]; linked?: string[] }> {
  const configPath = path.join(cwd, 'kb-labs.config.json');
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    return {
      allow: config.plugins?.allow,
      block: config.plugins?.block,
      linked: config.plugins?.linked,
    };
  } catch {
    return {};
  }
}

/**
 * Find manifest path using conventional locations
 * Returns path and whether it's deprecated
 */
async function findManifestPath(pkgRoot: string, pkg: any): Promise<{ path: string | null; deprecated: boolean }> {
  // Explicit path (preferred) - v1 manifest
  if (pkg.kb?.commandsManifest) {
    const manifestPath = path.join(pkgRoot, pkg.kb.commandsManifest);
    try {
      await fs.access(manifestPath);
      return { path: manifestPath, deprecated: false };
    } catch {
      return { path: null, deprecated: false };
    }
  }

  // Explicit path - v2 manifest
  if (pkg.kb?.manifest) {
    const manifestPath = path.join(pkgRoot, pkg.kb.manifest);
    try {
      await fs.access(manifestPath);
      return { path: manifestPath, deprecated: false };
    } catch {
      return { path: null, deprecated: false };
    }
  }

  // Check exports["./kb/commands"] (preferred convention)
  if (pkg.exports?.['./kb/commands']) {
    const exportPath = pkg.exports['./kb/commands'];
    const manifestPath = typeof exportPath === 'string' ? exportPath : exportPath.default || exportPath.import;
    if (manifestPath) {
      const resolved = path.resolve(pkgRoot, manifestPath);
      try {
        await fs.access(resolved);
        return { path: resolved, deprecated: false };
      } catch {
        // Try with .js extension
        const withExt = resolved.endsWith('.js') ? resolved : `${resolved}.js`;
        try {
          await fs.access(withExt);
          return { path: withExt, deprecated: false };
        } catch {}
      }
    }
  }

  // Deprecated: kb/manifest.* or dist/kb/manifest.js
  const deprecatedPaths = [
    path.join(pkgRoot, 'kb', 'manifest.mjs'),
    path.join(pkgRoot, 'kb', 'manifest.js'),
    path.join(pkgRoot, 'kb', 'manifest.cjs'),
    path.join(pkgRoot, 'dist', 'kb', 'manifest.js'),
  ];

  for (const depPath of deprecatedPaths) {
    try {
      await fs.access(depPath);
      return { path: depPath, deprecated: true };
    } catch {}
  }

  return { path: null, deprecated: false };
}

/**
 * Check if package is a plugin by keywords or kb.plugin flag
 */
function isPluginPackage(pkg: any): boolean {
  if (!pkg) {return false;}
  
  // Explicit flag
  if (pkg.kb?.plugin === true) {return true;}
  
  // Keyword check
  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];
  return keywords.includes('kb-cli-plugin');
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
    const pkgPattern = path.join(pattern, 'package.json');
    const pkgFiles = await glob(pkgPattern, { 
      cwd, 
      absolute: false,
      ignore: ['.kb/**', 'node_modules/**', '**/node_modules/**'] // Ignore .kb, node_modules
    });
    
    for (const pkgFile of pkgFiles) {
      const pkgRoot = path.dirname(path.join(cwd, pkgFile));
      const pkg = await readPackageJson(path.join(cwd, pkgFile));
      
      if (!pkg) {continue;}
      
      // Check if package has manifest (explicit or conventional)
      const manifestInfo = await findManifestPath(pkgRoot, pkg);
      if (manifestInfo.path) {
        if (manifestInfo.deprecated) {
          log('warn', `[DEPRECATED] ${pkg.name} uses legacy manifest path: ${manifestInfo.path}`);
          log('warn', `  → Migrate to exports["./kb/commands"] or set kb.commandsManifest in package.json`);
        }
        packageInfos.push({ pkgRoot, pkg, manifestPath: manifestInfo.path });
      }
    }
  }
  
  // Second pass: load all manifests in parallel
  const loadPromises = packageInfos.map(async ({ pkgRoot, pkg, manifestPath }) => {
    const pkgStart = Date.now();
    try {
      const manifests = await loadManifestWithTimeout(manifestPath, pkg.name, pkgRoot);
      const pkgTime = Date.now() - pkgStart;
      
      if (pkgTime > 30) {
        log('debug', `[plugins][perf] ${pkg.name} manifest parse: ${pkgTime}ms (budget: 30ms)`);
      }
      
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
      const pkgTime = Date.now() - pkgStart;
      log('debug', `[plugins][perf] ${pkg.name} failed after ${pkgTime}ms`);
      
      // On failure, register a synthetic unavailable manifest so user sees the product with a hint
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
      const synthetic = createUnavailableManifest(pkg.name, err);
      return {
        manifests: [synthetic],
        source: 'workspace' as const,
        packageName: pkg.name,
        manifestPath: toPosixPath(manifestPath),
        pkgRoot: toPosixPath(pkgRoot),
      };
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
    if (!pkg) {return null;}
    
    const manifestInfo = await findManifestPath(cwd, pkg);
    if (manifestInfo.path) {
      if (manifestInfo.deprecated) {
        log('warn', `[DEPRECATED] ${pkg.name} uses legacy manifest path: ${manifestInfo.path}`);
        log('warn', `  → Migrate to exports["./kb/commands"] or set kb.commandsManifest in package.json`);
      }
      const manifests = await loadManifestWithTimeout(manifestInfo.path, pkg.name, cwd);
      if (manifests.length > 0) {
        validateUniqueIds(manifests, pkg.name);
        return {
          manifests,
          source: 'workspace',
          packageName: pkg.name,
          manifestPath: toPosixPath(manifestInfo.path),
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
 * Discover commands from node_modules with keyword-based discovery
 * Scans all scopes, respects allowlist/blocklist, supports linked plugins
 */
async function discoverNodeModules(cwd: string): Promise<DiscoveryResult[]> {
  const nmDir = path.join(cwd, 'node_modules');
  const config = await loadConfig(cwd);
  
  try {
    const entries = await fs.readdir(nmDir, { withFileTypes: true });
    const packageInfos: Array<{pkgRoot: string, pkg: any, manifestPath: string, isLinked?: boolean}> = [];
    
    // First pass: collect all plugin packages
    const scanPromises: Promise<void>[] = [];
    
    for (const entry of entries) {
      if (!entry.isDirectory()) {continue;}
      
      const scanEntry = async () => {
        let pkgRoot: string;
        let pkg: any;
        
        if (entry.name.startsWith('@')) {
          // Scoped package: @scope/name
          const scopeDir = path.join(nmDir, entry.name);
          try {
            const scopedDirs = await fs.readdir(scopeDir, { withFileTypes: true });
            for (const scopedEntry of scopedDirs.filter(d => d.isDirectory())) {
              pkgRoot = path.join(scopeDir, scopedEntry.name);
              pkg = await readPackageJson(path.join(pkgRoot, 'package.json'));
              
              if (!pkg) {continue;}
              
              // Check if it's a plugin
              const isPlugin = isPluginPackage(pkg);
              
              // For @kb-labs/*, always include if has manifest
              // For others, require keyword/flag AND allowlist (unless explicitly blocked)
              if (pkg.name?.startsWith('@kb-labs/')) {
                const manifestInfo = await findManifestPath(pkgRoot, pkg);
                if (manifestInfo.path) {
                  packageInfos.push({ pkgRoot, pkg, manifestPath: manifestInfo.path });
                }
              } else if (isPlugin) {
                // 3rd-party plugin: check allowlist/blocklist
                if (config.block?.includes(pkg.name)) {
                  log('debug', `Plugin ${pkg.name} blocked by config`);
                  return;
                }
                
                // Must be allowlisted OR in linked list
                const isAllowlisted = config.allow?.includes(pkg.name) || config.linked?.includes(pkg.name);
                if (!isAllowlisted) {
                  log('debug', `Plugin ${pkg.name} skipped (not allowlisted). Add to kb-labs.config.json plugins.allow or enable via 'kb plugins enable'`);
                  return;
                }
                
                const manifestInfo = await findManifestPath(pkgRoot, pkg);
                if (manifestInfo.path) {
                  if (manifestInfo.deprecated) {
                    log('warn', `[DEPRECATED] ${pkg.name} uses legacy manifest path: ${manifestInfo.path}`);
                    log('warn', `  → Migrate to exports["./kb/commands"] or set kb.commandsManifest in package.json`);
                  }
                  const isLinked = config.linked?.includes(pkg.name);
                  packageInfos.push({ pkgRoot, pkg, manifestPath: manifestInfo.path, isLinked });
                }
              }
            }
          } catch {
            // Scope dir doesn't exist or can't read
          }
        } else {
          // Unscoped package
          pkgRoot = path.join(nmDir, entry.name);
          pkg = await readPackageJson(path.join(pkgRoot, 'package.json'));
          
          if (!pkg) {return;}
          
          const isPlugin = isPluginPackage(pkg);
          
          if (isPlugin) {
            // 3rd-party: check allowlist/blocklist
            if (config.block?.includes(pkg.name)) {
              log('debug', `Plugin ${pkg.name} blocked by config`);
              return;
            }
            
            const isAllowlisted = config.allow?.includes(pkg.name) || config.linked?.includes(pkg.name);
            if (!isAllowlisted) {
              log('debug', `Plugin ${pkg.name} skipped (not allowlisted). Add to kb-labs.config.json plugins.allow or enable via 'kb plugins enable'`);
              return;
            }
            
            const manifestInfo = await findManifestPath(pkgRoot, pkg);
            if (manifestInfo.path) {
              if (manifestInfo.deprecated) {
                log('warn', `[DEPRECATED] ${pkg.name} uses legacy manifest path: ${manifestInfo.path}`);
                log('warn', `  → Migrate to exports["./kb/commands"] or set kb.commandsManifest in package.json`);
              }
              const isLinked = config.linked?.includes(pkg.name);
              packageInfos.push({ pkgRoot, pkg, manifestPath: manifestInfo.path, isLinked });
            }
          }
        }
      };
      
      scanPromises.push(scanEntry());
    }
    
    await Promise.allSettled(scanPromises);
    
    // Second pass: load all manifests in parallel
    const loadPromises = packageInfos.map(async ({ pkgRoot, pkg, manifestPath, isLinked }) => {
      try {
        const manifests = await loadManifestWithTimeout(manifestPath, pkg.name, pkgRoot);
        if (manifests.length > 0) {
          validateUniqueIds(manifests, pkg.name);
          return {
            manifests,
            source: (isLinked ? 'linked' : 'node_modules') as 'node_modules' | 'linked',
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
        const synthetic = createUnavailableManifest(pkg.name, err);
        return {
          manifests: [synthetic],
          source: (isLinked ? 'linked' : 'node_modules') as 'node_modules' | 'linked',
          packageName: pkg.name,
          manifestPath: toPosixPath(manifestPath),
          pkgRoot: toPosixPath(pkgRoot),
        };
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
  } catch (err: any) {
    // node_modules doesn't exist or can't read
    log('debug', `Could not scan node_modules: ${err.message}`);
    return [];
  }
}

/**
 * Deduplicate manifests by priority: workspace > linked > node_modules
 * Also deduplicate by package path to avoid duplicate workspace packages
 */
function deduplicateManifests(all: DiscoveryResult[]): DiscoveryResult[] {
  const byPackageName = new Map<string, DiscoveryResult>();
  
  // Priority order: workspace > linked > node_modules
  const priority: Record<string, number> = {
    workspace: 3,
    linked: 2,
    node_modules: 1,
    builtin: 0,
  };
  
  // First, deduplicate by package name (keeping only one version of each package)
  for (const result of all) {
    const existing = byPackageName.get(result.packageName);
    if (!existing) {
      byPackageName.set(result.packageName, result);
    } else {
      // Compare priority
      const existingPriority = priority[existing.source] || 0;
      const newPriority = priority[result.source] || 0;
      if (newPriority > existingPriority) {
        // Higher priority wins
        byPackageName.set(result.packageName, result);
      }
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
    
    // Check lockfile hash
    const currentLockfileHash = await computeLockfileHash(cwd);
    if (currentLockfileHash && cache.lockfileHash && cache.lockfileHash !== currentLockfileHash) {
      log('debug', 'Cache invalidated: lockfile changed');
      return null;
    }
    
    // Check config hash
    const currentConfigHash = await computeConfigHash(cwd);
    if (currentConfigHash && cache.configHash && cache.configHash !== currentConfigHash) {
      log('debug', 'Cache invalidated: kb-labs.config.json changed');
      return null;
    }
    
    // Check plugins state hash
    const currentPluginsStateHash = await computePluginsStateHash(cwd);
    if (currentPluginsStateHash && cache.pluginsStateHash && cache.pluginsStateHash !== currentPluginsStateHash) {
      log('debug', 'Cache invalidated: .kb/plugins.json changed');
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
  
  // Compute hashes for invalidation triggers
  const lockfileHash = await computeLockfileHash(cwd);
  const configHash = await computeConfigHash(cwd);
  const pluginsStateHash = await computePluginsStateHash(cwd);
  
  const cache: CacheFile = {
    version: process.version,
    cliVersion: process.env.CLI_VERSION || '0.1.0',
    timestamp: Date.now(),
    lockfileHash: lockfileHash || undefined,
    configHash: configHash || undefined,
    pluginsStateHash: pluginsStateHash || undefined,
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
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  
  // Check cache first
  if (!noCache) {
    const cacheStart = Date.now();
    const cached = await loadCache(cwd);
    timings.cacheLoad = Date.now() - cacheStart;
    
    if (cached) {
      log('debug', 'Using cached manifests');
      // Filter out stale packages and return fresh ones
      const freshResults: DiscoveryResult[] = [];
      for (const [_pkgName, entry] of Object.entries(cached.packages)) {
        if (!isPackageCacheStale(entry)) {
          freshResults.push(entry.result);
        }
      }
      if (freshResults.length > 0) {
        const totalTime = Date.now() - startTime;
        const sourceCounts = freshResults.reduce((acc, r) => {
          acc[r.source] = (acc[r.source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        // Record telemetry
        telemetry.recordDiscovery({
          duration: totalTime,
          packagesFound: freshResults.length,
          cacheHit: true,
          sources: sourceCounts,
        });
        
        log('info', `[plugins][discover] ${totalTime}ms (cached: ${Object.entries(sourceCounts).map(([s, c]) => `${s}:${c}`).join(', ')})`);
        return freshResults;
      }
    }
  }
  
  // Try workspace first
  let workspace: DiscoveryResult[] = [];
  try {
    const wsStart = Date.now();
    workspace = await discoverWorkspace(cwd);
    timings.workspace = Date.now() - wsStart;
    log('info', `Discovered ${workspace.length} workspace packages with CLI manifests`);
  } catch (_err: any) {
    // No pnpm-workspace.yaml - fallback to current package + node_modules
    log('info', 'No workspace file found, checking current package');
    
    const currentStart = Date.now();
    const currentPkg = await discoverCurrentPackage(cwd);
    timings.currentPackage = Date.now() - currentStart;
    
    if (currentPkg) {
      workspace = [currentPkg];
      log('info', `Discovered current package with CLI manifest: ${currentPkg.packageName}`);
    }
  }
  
  // Discover from node_modules
  const nmStart = Date.now();
  const installed = await discoverNodeModules(cwd);
  timings.nodeModules = Date.now() - nmStart;
  if (installed.length > 0) {
    log('info', `Discovered ${installed.length} installed packages with CLI manifests`);
  }
  
  // Deduplicate
  const dedupStart = Date.now();
  const results = deduplicateManifests([...workspace, ...installed]);
  timings.deduplicate = Date.now() - dedupStart;
  
  // Save cache
  const saveStart = Date.now();
  await saveCache(cwd, results);
  timings.cacheSave = Date.now() - saveStart;
  
  // Log detailed timings
  const totalTime = Date.now() - startTime;
  const sourceCounts = results.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const timingDetails = Object.entries(timings)
    .filter(([_, t]) => t > 0)
    .map(([k, v]) => `${k}:${v}ms`)
    .join(', ');
  
  // Record telemetry
  telemetry.recordDiscovery({
    duration: totalTime,
    packagesFound: results.length,
    cacheHit: false,
    sources: sourceCounts,
  });
  
  log('info', `[plugins][discover] ${totalTime}ms (${Object.entries(sourceCounts).map(([s, c]) => `${s}:${c}`).join(', ')})${timingDetails ? ` | ${timingDetails}` : ''}`);
  
  // Performance budget warnings
  if (totalTime > 150) {
    log('warn', `[plugins][perf] Discovery took ${totalTime}ms (budget: 150ms)`);
  }
  
  return results;
}

/**
 * Lazy load manifests for a specific namespace
 * Only loads manifests from packages matching the namespace
 */
export async function discoverManifestsByNamespace(
  cwd: string,
  namespace: string,
  noCache = false
): Promise<DiscoveryResult[]> {
  const allResults = await discoverManifests(cwd, noCache);
  
  // Filter by namespace
  return allResults.filter(result => {
    // Check if any manifest in this result matches the namespace
    return result.manifests.some(m => {
      const manifestNamespace = m.namespace || m.group;
      return manifestNamespace === namespace;
    });
  });
}

