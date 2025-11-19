/**
 * @kb-labs/cli-commands/registry
 * Command manifest discovery - workspace, node_modules, current package
 */

import { PluginRegistry } from '@kb-labs/cli-core';
import { detectRepoRoot } from '@kb-labs/core-cli-adapters';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import type { CommandManifest, DiscoveryResult, CacheFile, PackageCacheEntry, CommandModule } from './types';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { log } from '../utils/logger';
import { toPosixPath } from '../utils/path';
import { telemetry } from './telemetry';
import { validateManifests, normalizeManifest } from './schema';

const SETUP_COMMAND_FLAGS = [
  {
    name: 'force',
    type: 'boolean' as const,
    description: 'Overwrite existing configuration and files.',
  },
  {
    name: 'dry-run',
    type: 'boolean' as const,
    description: 'Preview setup changes without writing to disk.',
  },
  {
    name: 'yes',
    type: 'boolean' as const,
    description: 'Auto-confirm modifications outside the .kb/ directory.',
  },
  {
    name: 'kb-only',
    type: 'boolean' as const,
    description: 'Restrict setup to .kb/ paths and skip project files.',
  },
] satisfies Exclude<CommandManifest['flags'], undefined>;

/**
 * Create loader stub for ManifestV2 commands.
 * Loader should never be executed directly – CLI adapters must handle execution.
 */
function createManifestV2Loader(commandId: string): () => Promise<{ run: any }> {
  return async () => {
    throw new Error(
      `Loader should not be called for ManifestV2 command ${commandId}. Use plugin-adapter-cli executeCommand instead.`
    );
  };
}

async function loadSetupCommandModule({
  manifestV2,
  namespace,
  pkgName,
  pkgRoot,
}: SetupCommandFactoryInput): Promise<CommandModule> {
  const module = await import('../commands/system/plugin-setup-command.js');
  if (typeof module.createPluginSetupCommand !== 'function') {
    throw new Error('Failed to load plugin setup command factory');
  }
  const command = module.createPluginSetupCommand({
    manifest: manifestV2,
    namespace,
    packageName: pkgName,
    pkgRoot,
  });
  return {
    run: async (ctx, argv, flags) => {
      const result = await command.run(ctx, argv, flags);
      return typeof result === 'number' ? result : undefined;
    },
  };
}

async function loadSetupRollbackCommandModule({
  manifestV2,
  namespace,
  pkgName,
  pkgRoot,
}: SetupCommandFactoryInput): Promise<CommandModule> {
  const module = await import('../commands/system/plugin-setup-rollback.js');
  if (typeof module.createPluginSetupRollbackCommand !== 'function') {
    throw new Error('Failed to load plugin setup rollback command factory');
  }
  const command = module.createPluginSetupRollbackCommand({
    manifest: manifestV2,
    namespace,
    packageName: pkgName,
    pkgRoot,
  });
  return {
    run: async (ctx, argv, flags) => {
      const result = await command.run(ctx, argv, flags);
      return typeof result === 'number' ? result : undefined;
    },
  };
}

/**
 * Ensure manifest has loader function (rehydrate after JSON serialization).
 */
function ensureManifestLoader(manifest: CommandManifest): void {
  if (typeof manifest.loader !== 'function') {
    const commandId = manifest.id || manifest.group || 'unknown';
    if ((manifest as any).isSetup) {
      log('debug', `[plugins][cache] Rehydrated setup loader for ${commandId}`);
      manifest.loader = () =>
        loadSetupCommandModule({
          manifestV2: (manifest as any).manifestV2,
          namespace: manifest.namespace || manifest.group || deriveNamespace(manifest.package || commandId),
          pkgName: manifest.package || commandId,
          pkgRoot: (manifest as any).pkgRoot,
        });
      return;
    }
    if ((manifest as any).isSetupRollback) {
      log('debug', `[plugins][cache] Rehydrated setup rollback loader for ${commandId}`);
      manifest.loader = () =>
        loadSetupRollbackCommandModule({
          manifestV2: (manifest as any).manifestV2,
          namespace: manifest.namespace || manifest.group || deriveNamespace(manifest.package || commandId),
          pkgName: manifest.package || commandId,
          pkgRoot: (manifest as any).pkgRoot,
        });
      return;
    }
    log('debug', `[plugins][cache] Rehydrated loader for ${commandId}`);
    manifest.loader = createManifestV2Loader(commandId);
  }
}

export const __test = {
  ensureManifestLoader,
  createManifestV2Loader,
};

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
const IN_PROC_CACHE_TTL_MS = 60_000;
const DISK_CACHE_TTL_MS = 5 * 60_000;

let inProcDiscoveryCache: { timestamp: number; results: DiscoveryResult[] } | null = null;

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
 * Detect whether new workspace packages with manifests appeared since cache was written.
 * If so, cached results are considered stale to ensure new commands are registered.
 */
async function detectNewWorkspacePackages(
  cwd: string,
  cachedPackages: Record<string, PackageCacheEntry> | undefined
): Promise<boolean> {
  if (!cachedPackages) {
    return true;
  }

  try {
    const workspaceYaml = path.join(cwd, 'pnpm-workspace.yaml');
    const content = await fs.readFile(workspaceYaml, 'utf8');
    const parsed = parseYaml(content) as { packages?: string[] };
    if (!Array.isArray(parsed.packages)) {
      return false;
    }

    const knownPackages = new Set(Object.keys(cachedPackages));

    for (const pattern of parsed.packages) {
      const pkgPattern = path.join(pattern, 'package.json');
      const pkgFiles = await glob(pkgPattern, {
        cwd,
        absolute: false,
        ignore: ['.kb/**', 'node_modules/**', '**/node_modules/**'],
      });

      for (const pkgFile of pkgFiles) {
        const pkgRoot = path.dirname(path.join(cwd, pkgFile));
        const pkg = await readPackageJson(path.join(cwd, pkgFile));
        if (!pkg || !pkg.name) {
          continue;
        }

        if (knownPackages.has(pkg.name)) {
          continue;
        }

        const manifestInfo = await findManifestPath(pkgRoot, pkg);
        if (manifestInfo.path) {
          log('debug', `[plugins][cache] New workspace package detected: ${pkg.name}`);
          return true;
        }
      }
    }
  } catch (error: any) {
    log('debug', `[plugins][cache] Workspace scan skipped: ${error?.message || 'unknown error'}`);
  }

  return false;
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
 * Prefer namespace from ManifestV2.id (e.g., '@kb-labs/release' -> 'release').
 * Fallback to package name heuristic if id is missing.
 */
function getNamespaceFromManifest(manifestV2: ManifestV2 | undefined, packageName: string): string {
  const manifestId = manifestV2?.id;
  if (typeof manifestId === 'string' && manifestId.length > 0) {
    // take last segment after slash, drop leading '@'
    const seg = manifestId.split('/').pop() || manifestId;
    return seg.replace(/^@/, '');
  }
  // Fallback: derive from package name (last path segment without org scope)
  const parts = packageName.split('/');
  const last = parts[parts.length - 1] || packageName;
  return last.replace(/^@/, '');
}

/**
 * Derive namespace from package name (legacy fallback)
 */
function deriveNamespace(packageName: string): string {
  const parts = packageName.split('/');
  const lastPart = parts[parts.length - 1] || packageName;
  return lastPart.replace(/^@/, '');
}

interface SetupCommandFactoryInput {
  manifestV2: ManifestV2;
  namespace: string;
  pkgName: string;
  pkgRoot: string;
}

function createSetupCommandManifest({
  manifestV2,
  namespace,
  pkgName,
  pkgRoot,
}: SetupCommandFactoryInput): CommandManifest {
  const setupId = `${namespace}:setup`;
  const describe =
    manifestV2.setup?.describe ||
    `Initialize ${manifestV2.display?.name || manifestV2.id || namespace}`;

  const setupManifest: CommandManifest = {
    manifestVersion: '1.0',
    id: setupId,
    group: namespace,
    describe,
    flags: SETUP_COMMAND_FLAGS,
    examples: [
      `kb ${namespace} setup`,
      `kb ${namespace} setup --dry-run`,
    ],
    loader: () =>
      loadSetupCommandModule({
        manifestV2,
        namespace,
        pkgName,
        pkgRoot,
      }),
    package: pkgName,
    namespace,
  };

  (setupManifest as any).manifestV2 = manifestV2;
  (setupManifest as any).pkgRoot = pkgRoot;
  (setupManifest as any).isSetup = true;
  return setupManifest;
}

function createSetupRollbackCommandManifest({
  manifestV2,
  namespace,
  pkgName,
  pkgRoot,
}: SetupCommandFactoryInput): CommandManifest {
  const rollbackId = `${namespace}:setup:rollback`;
  const describe = `Rollback setup changes for ${manifestV2.display?.name || manifestV2.id || namespace}`;

  const rollbackManifest: CommandManifest = {
    manifestVersion: '1.0',
    id: rollbackId,
    group: namespace,
    describe,
    flags: [
      {
        name: 'log',
        type: 'string' as const,
        description: 'Path to a setup change log JSON file.',
      },
      {
        name: 'list',
        type: 'boolean' as const,
        description: 'List available setup change logs.',
      },
      {
        name: 'yes',
        type: 'boolean' as const,
        alias: 'y',
        description: 'Apply rollback without confirmation prompt.',
      },
    ],
    examples: [
      `kb ${namespace} setup:rollback --list`,
      `kb ${namespace} setup:rollback --log .kb/logs/setup/${namespace}-<id>.json --yes`,
    ],
    loader: () =>
      loadSetupRollbackCommandModule({
        manifestV2,
        namespace,
        pkgName,
        pkgRoot,
      }),
    package: pkgName,
    namespace,
  };

  (rollbackManifest as any).manifestV2 = manifestV2;
  (rollbackManifest as any).pkgRoot = pkgRoot;
  (rollbackManifest as any).isSetupRollback = true;
  return rollbackManifest;
}

/**
 * Load manifest - tries ESM first, falls back to CJS
 * Validates and normalizes manifests according to schema
 */
async function loadManifest(manifestPath: string, pkgName: string, pkgRoot?: string): Promise<CommandManifest[]> {
  const fileUrl = pathToFileURL(manifestPath).href;
  const mod = await import(fileUrl);
  
  const manifestV2 = (mod as any).manifest || (mod as any).default;
  if (!manifestV2 || typeof manifestV2 !== 'object' || manifestV2.schema !== 'kb.plugin/2') {
    throw new Error(`Unsupported manifest format in ${pkgName}. Only ManifestV2 is supported.`);
  }
  
  const namespace = getNamespaceFromManifest(manifestV2, pkgName);
  const manifestDir = path.dirname(manifestPath);
  const baseRoot = pkgRoot || manifestDir;
  const cliCommands = Array.isArray(manifestV2.cli?.commands)
    ? manifestV2.cli.commands
    : [];
  if (cliCommands.length === 0 && !manifestV2.setup) {
    log('warn', `ManifestV2 ${manifestV2.id || pkgName} has no CLI commands or setup entry`);
  }
  
  const commandManifests: CommandManifest[] = cliCommands.map((cmd: any) => {
    const commandId = cmd.id.includes(':') ? cmd.id : `${cmd.group || namespace}:${cmd.id}`;
    const commandManifest: CommandManifest = {
      manifestVersion: '1.0' as const,
      id: commandId,
      group: cmd.group || namespace,
      describe: cmd.describe || '',
      longDescription: cmd.longDescription,
      aliases: cmd.aliases,
      flags: cmd.flags,
      examples: cmd.examples,
      loader: createManifestV2Loader(commandId),
      package: pkgName,
      namespace: cmd.group || namespace,
    };
    (commandManifest as any).manifestV2 = manifestV2;
    (commandManifest as any).pkgRoot = baseRoot;
    return commandManifest;
  });

  if (manifestV2.setup) {
    // Ensure setup/rollback registered under a stable namespace taken from manifest id
    const setupNamespace = getNamespaceFromManifest(manifestV2, pkgName);
    const setupCommand = createSetupCommandManifest({
      manifestV2,
      namespace: setupNamespace,
      pkgName,
      pkgRoot: baseRoot,
    });
    commandManifests.push(setupCommand);

    const rollbackCommand = createSetupRollbackCommandManifest({
      manifestV2,
      namespace: setupNamespace,
      pkgName,
      pkgRoot: baseRoot,
    });
    commandManifests.push(rollbackCommand);
  }
  
  const validation = validateManifests(commandManifests);
  if (!validation.success) {
    const errorMessages = validation.errors.map(err => 
      err.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
    ).join('; ');
    log('warn', `ManifestV2 validation warnings for ${pkgName}: ${errorMessages}`);
  }
  
  const normalized = (validation.success ? validation.data : commandManifests).map(m => 
    normalizeManifest(m, pkgName, namespace)
  );
  
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
  if (pkg.kb?.manifest) {
    const manifestPath = path.join(pkgRoot, pkg.kb.manifest);
    try {
      await fs.access(manifestPath);
      return { path: manifestPath, deprecated: false };
    } catch {
      return { path: null, deprecated: false };
    }
  }

  if (pkg.exports?.['./kb/commands']) {
    const exportPath = pkg.exports['./kb/commands'];
    const manifestPath = typeof exportPath === 'string' ? exportPath : exportPath.default || exportPath.import;
    if (manifestPath) {
      const resolved = path.resolve(pkgRoot, manifestPath);
      try {
        await fs.access(resolved);
        return { path: resolved, deprecated: false };
      } catch {
        const withExt = resolved.endsWith('.js') ? resolved : `${resolved}.js`;
        try {
          await fs.access(withExt);
          return { path: withExt, deprecated: false };
        } catch {}
      }
    }
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
    
    const parsedCache = cache as CacheFile;
    parsedCache.ttlMs = parsedCache.ttlMs ?? DISK_CACHE_TTL_MS;
    for (const entry of Object.values(parsedCache.packages) as PackageCacheEntry[]) {
      for (const manifest of entry.result.manifests) {
        ensureManifestLoader(manifest);
      }
      entry.cachedAt = entry.cachedAt ?? parsedCache.timestamp ?? Date.now();
    }
    
    return parsedCache;
  } catch {
    return null; // Cache doesn't exist or is corrupt
  }
}

/**
 * Check if cache is stale for a specific package (async to support hash validation)
 */
async function isPackageCacheStale(
  entry: PackageCacheEntry,
  options: { validateHash: boolean }
): Promise<boolean> {
  const manifestFsPath = entry.manifestPath.split('/').join(path.sep);
  const pkgJsonPath = path.join(entry.result.pkgRoot.split('/').join(path.sep), 'package.json');

  try {
    const pkgStat = await fs.stat(pkgJsonPath);
    if (pkgStat.mtimeMs !== entry.pkgJsonMtime) {
      log('debug', `Package cache invalidated: package.json changed for ${entry.result.packageName}`);
      return true;
    }
  } catch (error: any) {
    log('debug', `Package cache invalidated: missing package.json for ${entry.result.packageName} (${error?.message || 'unknown'})`);
    return true;
  }

  let manifestStat;
  try {
    manifestStat = await fs.stat(manifestFsPath);
    if (manifestStat.mtimeMs !== entry.manifestMtime) {
      log('debug', `Package cache invalidated: manifest mtime changed for ${entry.result.packageName}`);
      return true;
    }
  } catch (error: any) {
    log('debug', `Package cache invalidated: manifest deleted for ${entry.result.packageName} (${error?.message || 'unknown'})`);
    return true;
  }

  if (options.validateHash) {
    try {
      const currentHash = await computeManifestHash(manifestFsPath);
      if (currentHash !== entry.manifestHash) {
        log('debug', `Package cache invalidated: manifest hash changed for ${entry.result.packageName}`);
        return true;
      }
    } catch (error: any) {
      log('debug', `Package cache hash validation failed for ${entry.result.packageName}: ${error?.message || 'unknown'}`);
      return true;
    }
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
  const now = Date.now();
  const stateHasher = createHash('sha256');
  
  // Process each result into package cache entries
  for (const result of results) {
    try {
      const manifestHash = await computeManifestHash(result.manifestPath);
      
      // Get package.json mtime and version
      const pkgJsonPath = path.join(result.pkgRoot.split('/').join(path.sep), 'package.json');
      const pkgStat = await fs.stat(pkgJsonPath);
      const pkg = await readPackageJson(pkgJsonPath);
      const version = pkg?.version || '0.1.0';
      
      // Get manifest mtime
      const manifestStat = await fs.stat(result.manifestPath.split('/').join(path.sep));
      
      const manifestsForCache = result.manifests.map(manifest => {
        const manifestCopy = { ...manifest } as Record<string, unknown>;
        delete manifestCopy.loader;
        return manifestCopy;
      });

      const resultForCache = {
        ...result,
        manifests: manifestsForCache as unknown as CommandManifest[],
      };

      packages[result.packageName] = {
        version,
        manifestHash,
        manifestPath: result.manifestPath,
        pkgJsonMtime: pkgStat.mtimeMs,
        manifestMtime: manifestStat.mtimeMs,
        cachedAt: now,
        result: resultForCache,
      };
      stateHasher.update(result.packageName);
      stateHasher.update(manifestHash);
    } catch (err: any) {
      log('debug', `Failed to cache package ${result.packageName}: ${err.message}`);
    }
  }
  
  // Compute hashes for invalidation triggers
  const lockfileHash = await computeLockfileHash(cwd);
  const configHash = await computeConfigHash(cwd);
  const pluginsStateHash = await computePluginsStateHash(cwd);

  if (lockfileHash) {
    stateHasher.update(lockfileHash);
  }
  if (configHash) {
    stateHasher.update(configHash);
  }
  if (pluginsStateHash) {
    stateHasher.update(pluginsStateHash);
  }
  
  const cache: CacheFile = {
    version: process.version,
    cliVersion: process.env.CLI_VERSION || '0.1.0',
    timestamp: now,
    ttlMs: DISK_CACHE_TTL_MS,
    stateHash: stateHasher.digest('hex'),
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

  if (noCache) {
    inProcDiscoveryCache = null;
  } else if (inProcDiscoveryCache) {
    const age = Date.now() - inProcDiscoveryCache.timestamp;
    if (age < IN_PROC_CACHE_TTL_MS) {
      const cachedResults = inProcDiscoveryCache.results;
      const sourceCounts = cachedResults.reduce((acc, r) => {
        acc[r.source] = (acc[r.source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      telemetry.recordDiscovery({
        duration: age,
        packagesFound: cachedResults.length,
        cacheHit: true,
        sources: sourceCounts,
      });

      log('debug', `[plugins][discover] in-proc cache hit (${cachedResults.length} packages, age ${age}ms)`);
      return cachedResults;
    }
  }
  
  // Check cache first
  if (!noCache) {
    const cacheStart = Date.now();
    const cached = await loadCache(cwd);
    timings.cacheLoad = Date.now() - cacheStart;
    
    if (cached) {
      log('debug', 'Using cached manifests');
      // Filter out stale packages and return fresh ones
      const freshResults: DiscoveryResult[] = [];
      const cacheAge = Date.now() - cached.timestamp;
      const ttlMs = cached.ttlMs ?? DISK_CACHE_TTL_MS;
      const enforceHashValidation = cacheAge >= ttlMs;

      log('debug', `[plugins][cache] hit age=${cacheAge}ms ttl=${ttlMs}ms validateHash=${enforceHashValidation}`);

      for (const entry of Object.values(cached.packages) as PackageCacheEntry[]) {
        const stale = await isPackageCacheStale(entry, { validateHash: enforceHashValidation });
        if (!stale) {
          freshResults.push(entry.result);
        }
      }
      const hasNewWorkspacePackages = await detectNewWorkspacePackages(
        cwd,
        cached.packages,
      );

      if (freshResults.length > 0 && !hasNewWorkspacePackages) {
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
          cacheValidated: enforceHashValidation,
          sources: sourceCounts,
        });
        
        log('info', `[plugins][discover] ${totalTime}ms (cached: ${Object.entries(sourceCounts).map(([s, c]) => `${s}:${c}`).join(', ')})`);
        inProcDiscoveryCache = { timestamp: Date.now(), results: freshResults };
        return freshResults;
      }

      if (hasNewWorkspacePackages) {
        log('debug', '[plugins][cache] invalidated: new workspace packages detected');
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
  
  inProcDiscoveryCache = { timestamp: Date.now(), results };
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

