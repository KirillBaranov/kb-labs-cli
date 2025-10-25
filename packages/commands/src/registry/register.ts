/**
 * @kb-labs/cli-commands/registry
 * Manifest validation and registration with shadowing support
 */

import Ajv from 'ajv';
import type { CommandManifest, DiscoveryResult, RegisteredCommand } from './types.js';
import { checkRequires } from './availability.js';
import { log, getLogLevel } from '../utils/logger.js';

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
  if (manifest.flags) {
    for (const flag of manifest.flags) {
      validateFlagDef(flag, manifest.id);
    }
  }
}

/**
 * Check for workspace collision (hard error)
 */
function checkWorkspaceCollision(
  manifest: CommandManifest,
  existing: RegisteredCommand,
  currentSource: 'workspace' | 'node_modules' | 'builtin'
): void {
  // If both are from workspace, that's a hard error
  if (currentSource === 'workspace' && existing.source === 'workspace') {
    throw new Error(
      `Command ID collision: "${manifest.id}" is exported by multiple workspace packages. ` +
      `This is not allowed. Please rename one of the commands.`
    );
  }
}

/**
 * Register manifests with shadowing and collision detection
 */
export function registerManifests(
  discoveryResults: DiscoveryResult[],
  registry: any // CommandRegistry interface
): RegisteredCommand[] {
  const registered: RegisteredCommand[] = [];
  const globalIds = new Map<string, RegisteredCommand>();
  const globalAliases = new Map<string, RegisteredCommand>();
  const logLevel = getLogLevel();
  
  // Sort: builtin > workspace > node_modules
  const sorted = [...discoveryResults].sort((a, b) => {
    const order: Record<string, number> = { builtin: 0, workspace: 1, node_modules: 2 };
    return order[a.source] - order[b.source];
  });
  
  for (const result of sorted) {
    for (const manifest of result.manifests) {
      // Validate manifest structure
      try {
        validateManifestStructure(manifest);
      } catch (err: any) {
        log('error', `Validation failed for ${manifest.id}: ${err.message}`);
        throw err;
      }
      
      // Check availability
      const availability = checkRequires(manifest);
      
      const cmd: RegisteredCommand = {
        manifest,
        available: availability.available,
        unavailableReason: availability.reason,
        hint: availability.hint,
        source: result.source,
        shadowed: false,
      };
      
      // Check for ID collision
      const existing = globalIds.get(manifest.id);
      if (existing) {
        // Check workspace collision (hard error)
        checkWorkspaceCollision(manifest, existing, result.source);
        
        // Workspace/builtin wins over node_modules
        if (result.source !== 'node_modules') {
          existing.shadowed = true;
          globalIds.set(manifest.id, cmd);
          if (logLevel === 'info' || logLevel === 'debug') {
            log('info', `${manifest.id} from ${result.source} shadows ${existing.source} version`);
          }
        } else {
          cmd.shadowed = true;
          if (logLevel === 'info' || logLevel === 'debug') {
            log('info', `${manifest.id} from node_modules shadowed by ${existing.source} version`);
          }
        }
      } else {
        globalIds.set(manifest.id, cmd);
      }
      
      // Check alias collisions
      if (manifest.aliases && manifest.aliases.length > 0) {
        for (const alias of manifest.aliases) {
          const existingAlias = globalAliases.get(alias);
          if (existingAlias) {
            // Skip if both commands are the same (duplicate registration)
            if (existingAlias.manifest.id === manifest.id) {
              continue;
            }
            throw new Error(
              `Alias collision: "${alias}" used by both ${manifest.id} and ${existingAlias.manifest.id}`
            );
          }
          if (globalIds.has(alias)) {
            throw new Error(
              `Alias collision: "${alias}" conflicts with existing command ID`
            );
          }
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
  
  return registered;
}

