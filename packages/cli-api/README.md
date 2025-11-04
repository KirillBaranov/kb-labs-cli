# @kb-labs/cli-api

Programmatic API for KB Labs CLI - stable interface for REST API, webhooks, agents, and external integrations.

## Features

- **Stable JSON-compatible contracts** - no functions, classes, or CLI-specific side effects
- **Plugin discovery** - workspace, package.json, directories, explicit files
- **OpenAPI generation** - automatic spec generation from plugin manifests
- **Studio registry** - aggregated metadata for UI consumption
- **Caching** - in-memory cache with TTL
- **No subprocess spawning** - direct import and call methods

## Installation

```bash
pnpm add @kb-labs/cli-api
```

## Usage

### Basic Example

```typescript
import { createCliAPI } from '@kb-labs/cli-api';

const cli = await createCliAPI({
  discovery: {
    strategies: ['workspace', 'pkg', 'dir', 'file'],
    preferV2: true,
  },
  cache: {
    inMemory: true,
    ttlMs: 30_000,
  },
  logger: {
    level: 'info',
  },
});

// List plugins
const plugins = await cli.listPlugins();
console.log(plugins);

// Get manifest
const manifest = await cli.getManifestV2('@kb-labs/ai-review');
console.log(manifest);

// Get OpenAPI spec
const spec = await cli.getOpenAPISpec('@kb-labs/ai-review');
console.log(spec);

// Get studio registry (aggregated)
const registry = await cli.getStudioRegistry();
console.log(registry);

// Refresh discovery
await cli.refresh();

// Cleanup
await cli.dispose();
```

### REST API Integration

```typescript
// apps/rest-api/src/bootstrap.ts
import { createCliAPI } from '@kb-labs/cli-api';

export const cli = await createCliAPI({
  discovery: {
    strategies: ['workspace', 'pkg', 'dir', 'file'],
    roots: [process.cwd()],
    preferV2: true,
  },
  cache: {
    inMemory: true,
    ttlMs: 30_000,
  },
  logger: {
    level: 'info',
  },
});

// routes/openapi.ts
import { cli } from '../bootstrap.js';

fastify.get('/openapi.json', async (_, reply) => {
  const plugins = await cli.listPlugins();
  const specs = await Promise.all(
    plugins.map(p => cli.getOpenAPISpec(p.id))
  );
  
  const merged = mergeSpecs(specs.filter(Boolean));
  reply.send(merged);
});

// routes/registry.ts
fastify.get('/registry.json', async (_, reply) => {
  const registry = await cli.getStudioRegistry();
  reply.send(registry);
});
```

### Webhook Integration

```typescript
import { createCliAPI } from '@kb-labs/cli-api';

const cli = await createCliAPI({ /* ... */ });

// Listen for plugin changes
cli.onChange(diff => {
  console.log('Added:', diff.added);
  console.log('Removed:', diff.removed);
  console.log('Changed:', diff.changed);
  
  // Trigger webhook
  fetch('https://example.com/webhook', {
    method: 'POST',
    body: JSON.stringify(diff),
  });
});
```

## API Reference

### `createCliAPI(opts?: CliInitOptions): Promise<CliAPI>`

Creates and initializes a CLI API instance.

**Options:**

```typescript
interface CliInitOptions {
  discovery?: {
    strategies?: ('workspace' | 'pkg' | 'dir' | 'file')[];
    roots?: string[];
    preferV2?: boolean;
    allowDowngrade?: boolean;
    watch?: boolean;
    debounceMs?: number;
  };
  cache?: {
    inMemory: boolean;
    ttlMs?: number;
  };
  logger?: {
    level: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  };
}
```

### `CliAPI.listPlugins(): Promise<PluginBrief[]>`

Returns all discovered plugins.

### `CliAPI.getManifestV2(pluginId: string): Promise<ManifestV2 | null>`

Returns the V2 manifest for a specific plugin.

### `CliAPI.getOpenAPISpec(pluginId: string): Promise<OpenAPISpec | null>`

Generates OpenAPI specification for a plugin.

### `CliAPI.getStudioRegistry(): Promise<StudioRegistry>`

Returns aggregated registry for Studio UI.

### `CliAPI.refresh(): Promise<void>`

Manually refresh plugin discovery.

### `CliAPI.dispose(): Promise<void>`

Cleanup resources and dispose the API instance.

## Discovery Strategies

### Workspace

Discovers plugins from pnpm/yarn workspaces defined in `pnpm-workspace.yaml` or `package.json#workspaces`.

### Package

Discovers plugins from `package.json#kbLabs.manifest` and `package.json#kbLabs.plugins[]`.

### Directory

Discovers plugins from `.kb/plugins/` directory.

### File

Discovers plugins from explicit file paths.

## Resolution Rules

When multiple plugins with the same ID are found:

1. **Prefer V2 over V1** (if `preferV2` is true)
2. **Higher semver wins** (respects `allowDowngrade`)
3. **Source priority**: workspace > pkg > dir > file
4. **Alphabetical path order**

## Error Handling

All errors are returned in standardized `ErrorEnvelope` format:

```typescript
interface ErrorEnvelope {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  remediation?: string;
}
```

## Performance

- **In-memory cache**: Configurable TTL, default 30 seconds
- **Lazy loading**: Manifests loaded only when accessed
- **Parallel discovery**: All strategies run concurrently
- **Efficient deduplication**: Single pass with deterministic resolution

## License

MIT

