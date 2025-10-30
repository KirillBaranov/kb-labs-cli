# Plugin Manifest Specification

## Overview

KB CLI plugins define commands via a **manifest** - a declarative JSON/TypeScript structure that describes commands, their metadata, flags, and requirements.

## Manifest Location

Manifests are discovered via (in priority order):

1. `exports["./kb/commands"]` in package.json (preferred)
2. `kb.commandsManifest` in package.json
3. ~~`kb/manifest.*`~~ (deprecated, shows warnings)

## Manifest Structure

```typescript
interface CommandManifest {
  manifestVersion: '1.0';    // Required, must be '1.0'
  id: string;                // "namespace:command" format (e.g., "devlink:apply")
  aliases?: string[];        // Alternative names (e.g., ["devlink-apply"])
  group: string;             // Namespace (e.g., "devlink")
  namespace?: string;        // Explicit namespace (derived from group if not provided)
  package?: string;         // Full package name (e.g., "@kb-labs/devlink-cli")
  describe: string;         // Short description
  longDescription?: string; // Detailed description
  requires?: string[];       // Peer dependencies (e.g., ["@kb-labs/core@^1.0.0"])
  flags?: FlagDefinition[]; // Command flags
  examples?: string[];       // Usage examples
  loader: () => Promise<CommandModule>; // Async loader function
  
  // Engine requirements
  engine?: {
    node?: string;          // Node version (e.g., ">=18", "^18.0.0")
    kbCli?: string;         // CLI version (e.g., "^1.5.0")
    module?: 'esm' | 'cjs'; // Module type
  };
  
  // Permissions
  permissions?: string[];   // Required permissions (e.g., ["fs.read", "git.write"])
  
  // Telemetry
  telemetry?: 'opt-in' | 'off'; // Telemetry preference
}
```

## Flag Definition

```typescript
interface FlagDefinition {
  name: string;              // Flag name (e.g., "verbose")
  type: "string" | "boolean" | "number" | "array";
  alias?: string;            // Single letter alias (e.g., "v")
  description?: string;      // Flag description
  default?: any;            // Default value (must match type)
  choices?: string[];        // Allowed values (string type only)
  required?: boolean;        // Whether flag is required
}
```

## Lifecycle Hooks (Optional)

Plugins can export lifecycle hooks:

```typescript
// In manifest module
export async function init(ctx: { cwd: string; package: string; manifest: CommandManifest }) {
  // Called before registration
}

export async function register(ctx: { registry: any; command: RegisteredCommand; cwd: string; package: string }) {
  // Called during registration
}

export async function dispose(ctx: { registry: any; command: RegisteredCommand }) {
  // Called on shutdown/reload
}
```

## Examples

### Basic Manifest

```typescript
// src/kb/commands.ts
import type { CommandManifest } from '@kb-labs/cli-commands';

export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: 'my-plugin:hello',
    group: 'my-plugin',
    describe: 'Say hello',
    loader: async () => import('./commands/hello.js'),
  },
];
```

### Advanced Manifest

```typescript
export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: 'devlink:apply',
    group: 'devlink',
    namespace: 'devlink',
    package: '@kb-labs/devlink-cli',
    describe: 'Apply devlink configuration',
    longDescription: 'Applies the devlink configuration to the workspace...',
    aliases: ['devlink-apply', 'apply'],
    requires: ['@kb-labs/devlink-core@^1.0.0'],
    engine: {
      node: '>=18',
      kbCli: '^1.5.0',
      module: 'esm',
    },
    permissions: ['fs.read', 'fs.write'],
    flags: [
      {
        name: 'dry-run',
        type: 'boolean',
        alias: 'd',
        description: 'Simulate without making changes',
        default: false,
      },
      {
        name: 'profile',
        type: 'string',
        choices: ['dev', 'prod'],
        description: 'Profile to use',
        required: true,
      },
    ],
    examples: [
      'kb devlink apply --profile dev',
      'kb devlink apply --dry-run',
    ],
    loader: async () => import('./commands/apply.js'),
  },
];
```

## JSON Schema

See `schema/manifest.schema.json` for full JSON Schema validation.

## Validation Rules

1. `manifestVersion` must be `'1.0'`
2. `id` must match `namespace:command` format (lowercase, alphanumeric, hyphens)
3. `aliases` must be unique within package
4. `flags` must have correct types matching defaults
5. `choices` only allowed for `string` type flags
6. `requires` must be valid semver ranges

## Migration Guide

### From Legacy Paths

If using deprecated paths (`kb/manifest.*`, `dist/kb/manifest.js`):

1. Add to `package.json`:
   ```json
   {
     "exports": {
       "./kb/commands": "./dist/kb/commands.js"
     }
   }
   ```

2. Or set explicit path:
   ```json
   {
     "kb": {
       "commandsManifest": "dist/kb/commands.js"
     }
   }
   ```

## Best Practices

1. Use `namespace:command` format for IDs
2. Export via `exports["./kb/commands"]`
3. Add `keywords: ["kb-cli-plugin"]` for discoverability
4. Declare `engine.kbCli` for compatibility checks
5. Use whitespace aliases (automatic from `namespace:command`)

