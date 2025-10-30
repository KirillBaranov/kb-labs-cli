/**
 * @kb-labs/cli-commands/registry
 * Manifest validation and registration with shadowing support
 */

import Ajv from 'ajv';
import type { CommandManifest, DiscoveryResult, RegisteredCommand } from './types';
import { checkRequires } from './availability';
import { log, getLogLevel } from '../utils/logger';
import { telemetry } from './telemetry';

const ajv = new Ajv();

// Flag validation schema
const flagSchema = {
  type: 'object',
  required: ['name', 'type'],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    type: { enum: ['string', 'boolean', 'number', 'array'] },
    alias: { type: 'string', pattern: '^[a-z]$' }, // single letter
    description: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    required: { type: 'boolean' },
    default: {}, // must match type
  },
};

// Manifest schema with required manifestVersion
const manifestSchema = {
  type: 'object',
  required: ['manifestVersion', 'id', 'group', 'describe', 'loader'],
  additionalProperties: true,
  properties: {
    manifestVersion: { type: 'string', enum: ['1.0'] },
    id: { type: 'string', pattern: '^[a-z0-9-]+(?::[a-z0-9-]+){1,2}$' }, // 2-3 levels
    aliases: { type: 'array', items: { type: 'string' } },
    group: { type: 'string' },
    describe: { type: 'string' },
    longDescription: { type: 'string' },
    requires: { type: 'array', items: { type: 'string' } },
    flags: { 
      type: 'array', 
      items: flagSchema 
    },
    examples: { type: 'array', items: { type: 'string' } },
  },
};

const validateManifest = ajv.compile(manifestSchema);
const validateFlag = ajv.compile(flagSchema);

/**
 * Validate flag definition
 */
function validateFlagDef(flag: any, manifestId: string): void {
  if (!validateFlag(flag)) {
    throw new Error(
      `Invalid flag "${flag.name}" in ${manifestId}: ${ajv.errorsText(validateFlag.errors)}`
    );
  }
  
  // Validate choices only for string type
  if (flag.choices && flag.type !== 'string') {
    throw new Error(`Flag "${flag.name}" in ${manifestId}: choices allowed only for string type`);
  }
  
  // Validate default matches type
  if (flag.default !== undefined) {
    const typeMatches = 
      (flag.type === 'string' && typeof flag.default === 'string') ||
      (flag.type === 'boolean' && typeof flag.default === 'boolean') ||
      (flag.type === 'number' && typeof flag.default === 'number') ||
      (flag.type === 'array' && Array.isArray(flag.default));
    
    if (!typeMatches) {
      throw new Error(
        `Flag "${flag.name}" in ${manifestId}: default value type mismatch (expected ${flag.type})`
      );
    }
  }
}

/**
 * Validate single manifest
 */
function validateManifestStructure(manifest: any): void {
  if (!validateManifest(manifest)) {
    throw new Error(`Invalid manifest ${manifest.id}: ${ajv.errorsText(validateManifest.errors)}`);
  }
  
  // Validate manifestVersion (now required)
  if (manifest.manifestVersion !== '1.0') {
    throw new Error(
      `Unsupported manifestVersion "${manifest.manifestVersion}" in ${manifest.id} (expected "1.0")`
    );
  }
  
  // Validate flags if present
  if (manifest.flags && Array.isArray(manifest.flags) && manifest.id) {
    for (const flag of manifest.flags) {
      if (flag && typeof flag === 'object' && flag.name) {
        validateFlagDef(flag, manifest.id as string);
      }
    }
  }
}

/**
 * Priority order for source resolution
 */
const SOURCE_PRIORITY: Record<string, number> = {
  builtin: 4,
  workspace: 3,
  linked: 2,
  node_modules: 1,
};

/**
 * Normalize command ID to ensure it follows namespace:command format
 */
function normalizeCommandId(id: string, namespace: string): string {
  if (id.includes(':')) {
    // Already has namespace, ensure it matches
    const [ns, ...cmdParts] = id.split(':');
    if (ns !== namespace) {
      // Fix namespace mismatch
      return `${namespace}:${cmdParts.join(':')}`;
    }
    return id;
  }
  // No namespace, add it
  return `${namespace}:${id}`;
}

/**
 * Generate whitespace aliases from command ID
 * Example: "devlink:apply" -> ["devlink apply"]
 */
function generateWhitespaceAliases(id: string): string[] {
  if (!id.includes(':')) {
    return [];
  }
  // Replace colon with space
  return [id.replace(':', ' ')];
}

/**
 * Normalize aliases: ensure they're valid and add whitespace variants
 */
function normalizeAliases(manifest: CommandManifest): string[] {
  const aliases = new Set<string>();
  const namespace = manifest.namespace || manifest.group;
  
  // Add existing aliases
  if (manifest.aliases) {
    for (const alias of manifest.aliases) {
      // Validate alias format (no spaces, no special chars except hyphens)
      if (!/^[a-z0-9-:]+$/i.test(alias)) {
        log('warn', `Invalid alias "${alias}" in ${manifest.id}: aliases must be alphanumeric with hyphens or colons`);
        continue;
      }
      aliases.add(alias);
    }
  }
  
  // Add whitespace alias for scoped commands
  const whitespaceAliases = generateWhitespaceAliases(manifest.id);
  for (const alias of whitespaceAliases) {
    aliases.add(alias);
  }
  
  return Array.from(aliases);
}

/**
 * Check for namespace collision (same namespace, different commands with same base name)
 */
function checkNamespaceCollision(
  manifest: CommandManifest,
  existing: RegisteredCommand,
  namespace: string
): void {
  const [existingNs] = existing.manifest.id.split(':');
  const [currentNs, currentCmd] = manifest.id.split(':');
  
  // If both are in the same namespace and have same command name, that's a collision
  if (existingNs === currentNs && existingNs === namespace) {
    const [existingCmd] = existing.manifest.id.split(':').slice(1);
    if (existingCmd === currentCmd) {
      // Same namespace + same command = collision
      throw new Error(
        `Command collision in namespace "${namespace}": "${manifest.id}" conflicts with existing "${existing.manifest.id}". ` +
        `Rename one of the commands to use a different base name (e.g., "${namespace}:${currentCmd}2" or use --alias to create a different alias).`
      );
    }
  }
}

/**
 * Get priority for source
 */
function getSourcePriority(source: string): number {
  return SOURCE_PRIORITY[source] || 0;
}

/**
 * Check collision with actionable error message
 */
function checkCollision(
  manifest: CommandManifest,
  existing: RegisteredCommand,
  currentSource: string,
  namespace: string
): { shouldShadow: boolean; message?: string } {
  const existingPriority = getSourcePriority(existing.source);
  const currentPriority = getSourcePriority(currentSource);
  
  // Same namespace collision (hard error)
  checkNamespaceCollision(manifest, existing, namespace);
  
  // If both are from workspace, that's a hard error
  if (currentSource === 'workspace' && existing.source === 'workspace') {
    throw new Error(
      `Command ID collision: "${manifest.id}" is exported by multiple workspace packages. ` +
      `This is not allowed. Please rename one of the commands to use a different ID.`
    );
  }
  
  // Higher priority wins
  if (currentPriority > existingPriority) {
    return { shouldShadow: true };
  } else if (currentPriority < existingPriority) {
    return { shouldShadow: false };
  }
  
  // Same priority - first wins (shouldn't happen with proper sorting)
  return { shouldShadow: false };
}

/**
 * Register manifests with shadowing and collision detection
 */
export async function registerManifests(
  discoveryResults: DiscoveryResult[],
  registry: any // CommandRegistry interface
): Promise<RegisteredCommand[]> {
  const registered: RegisteredCommand[] = [];
  const globalIds = new Map<string, RegisteredCommand>();
  const globalAliases = new Map<string, RegisteredCommand>();
  const logLevel = getLogLevel();
  
  let collisions = 0;
  let errors = 0;
  
  // Sort by priority: builtin > workspace > linked > node_modules
  const sorted = [...discoveryResults].sort((a, b) => {
    const priorityA = getSourcePriority(a.source);
    const priorityB = getSourcePriority(b.source);
    return priorityB - priorityA; // Higher priority first
  });
  
  for (const result of sorted) {
    for (const manifest of result.manifests) {
      // Validate manifest structure
      try {
        validateManifestStructure(manifest);
      } catch (err: any) {
        errors++;
        telemetry.recordSchemaError(manifest.id, err.message);
        log('error', `Validation failed for ${manifest.id}: ${err.message}`);
        throw err;
      }
      
      // Ensure ID is normalized (should already be done by schema, but double-check)
      const namespace = manifest.namespace || manifest.group;
      const normalizedId = normalizeCommandId(manifest.id, namespace);
      if (normalizedId !== manifest.id) {
        log('warn', `Command ID "${manifest.id}" normalized to "${normalizedId}"`);
        manifest.id = normalizedId;
      }
      
      // Normalize aliases (add whitespace variants)
      const normalizedAliases = normalizeAliases(manifest);
      if (normalizedAliases.length > 0) {
        manifest.aliases = normalizedAliases;
      }
      
      // Check availability
      const availability = checkRequires(manifest);
      
      const cmd: RegisteredCommand = {
        manifest,
        available: availability.available,
        unavailableReason: availability.available ? undefined : availability.reason,
        hint: availability.available ? undefined : availability.hint,
        source: result.source,
        shadowed: false,
        pkgRoot: result.pkgRoot,
        packageName: result.packageName,
      };
      
      // Call lifecycle hooks if manifest module exports them
      // Hooks are called in order: init -> register -> (dispose on shutdown)
      try {
        // Load manifest module to check for lifecycle hooks
        // Note: We don't execute loader here, just check the module structure
        const manifestPath = result.manifestPath.replace(/\.(js|mjs)$/, '');
        const manifestModule = await import(manifestPath);
        
        // Call init hook (before registration)
        if (manifestModule.init && typeof manifestModule.init === 'function') {
          await manifestModule.init({
            cwd: result.pkgRoot,
            package: result.packageName,
            manifest: cmd.manifest,
          });
        }
        
        // Call register hook (during registration)
        if (manifestModule.register && typeof manifestModule.register === 'function') {
          await manifestModule.register({
            registry,
            command: cmd,
            cwd: result.pkgRoot,
            package: result.packageName,
          });
        }
        
        // Store dispose hook for later cleanup
        if (manifestModule.dispose && typeof manifestModule.dispose === 'function') {
          (cmd as any)._disposeHook = manifestModule.dispose;
        }
      } catch (err: any) {
        // Lifecycle hooks not available or failed, continue
        log('debug', `Lifecycle hooks not available for ${manifest.id}: ${err.message}`);
      }
      
      // Check for ID collision
      const existing = globalIds.get(manifest.id);
      if (existing) {
        try {
          const collision = checkCollision(manifest, existing, result.source, namespace);
          if (collision.shouldShadow) {
            // Current command shadows existing
            existing.shadowed = true;
            globalIds.set(manifest.id, cmd);
            if (logLevel === 'info' || logLevel === 'debug') {
              log('info', `${manifest.id} from ${result.source} shadows ${existing.source} version`);
            }
          } else {
            // Existing command shadows current
            cmd.shadowed = true;
            if (logLevel === 'info' || logLevel === 'debug') {
              log('info', `${manifest.id} from ${result.source} shadowed by ${existing.source} version`);
            }
          }
        } catch (err: any) {
          // Hard error from collision check
          log('error', err.message);
          throw err;
        }
      } else {
        globalIds.set(manifest.id, cmd);
      }
      
      // Check alias collisions (including whitespace aliases)
      const aliasesToCheck = manifest.aliases || [];
      for (const alias of aliasesToCheck) {
        const existingAlias = globalAliases.get(alias);
        if (existingAlias) {
          // Skip if both commands are the same (duplicate registration)
          if (existingAlias.manifest.id === manifest.id) {
            continue;
          }
          
          // Check if we can resolve by priority
          const existingPriority = getSourcePriority(existingAlias.source);
          const currentPriority = getSourcePriority(result.source);
          
          if (currentPriority > existingPriority) {
            // Current wins, shadow existing
            existingAlias.shadowed = true;
            globalAliases.set(alias, cmd);
            if (logLevel === 'info' || logLevel === 'debug') {
              log('info', `Alias "${alias}" from ${result.source} shadows ${existingAlias.source} version`);
            }
          } else if (currentPriority < existingPriority) {
            // Existing wins, skip current alias
            if (logLevel === 'info' || logLevel === 'debug') {
              log('info', `Alias "${alias}" from ${result.source} shadowed by ${existingAlias.source} version`);
            }
            continue;
          } else {
            // Same priority - collision error
            collisions++;
            throw new Error(
              `Alias collision: "${alias}" used by both ${manifest.id} and ${existingAlias.manifest.id}. ` +
              `Rename one alias or use a different namespace.`
            );
          }
        }
        
        // Check if alias conflicts with command ID
        if (globalIds.has(alias)) {
          const conflictingCmd = globalIds.get(alias)!;
          const existingPriority = getSourcePriority(conflictingCmd.source);
          const currentPriority = getSourcePriority(result.source);
          
          if (currentPriority > existingPriority) {
            // Current wins, but warn
            log('warn', `Alias "${alias}" conflicts with command ID "${alias}". Alias will shadow command.`);
            globalAliases.set(alias, cmd);
          } else {
            throw new Error(
              `Alias "${alias}" conflicts with existing command ID "${alias}". ` +
              `Rename the alias or use a different name.`
            );
          }
        } else {
          globalAliases.set(alias, cmd);
        }
      }
      
      // Register if not shadowed
      if (!cmd.shadowed) {
        registry.registerManifest(cmd);
      }
      
      registered.push(cmd);
    }
  }
  
  // Record telemetry
  telemetry.recordRegistration({
    commandsRegistered: registered.length,
    collisions,
    errors,
  });
  
  return registered;
}

/**
 * Dispose all plugins by calling their dispose hooks
 */
export async function disposeAllPlugins(registry: any): Promise<void> {
  const manifests = registry.listManifests();
  const disposePromises: Promise<void>[] = [];
  
  for (const cmd of manifests) {
    const disposeHook = (cmd as any)._disposeHook;
    if (disposeHook && typeof disposeHook === 'function') {
      disposePromises.push(
        Promise.resolve(disposeHook({
          registry,
          command: cmd,
        })).catch((err: any) => {
          log('warn', `Dispose hook failed for ${cmd.manifest.id}: ${err.message}`);
        })
      );
    }
  }
  
  await Promise.allSettled(disposePromises);
}

