# @kb-labs/cli-api

Programmatic API for KB Labs CLI - stable interface for REST API, webhooks, agents, and external integrations.

## Features

- **Stable JSON-compatible contracts** - no functions, classes, or CLI-specific side effects
- **Plugin discovery** - workspace, package.json, directories, explicit files
- **Snapshot producer/consumer** - persist registry metadata to `.kb/cache/registry.json` or consume an existing snapshot on cold start
- **Redis pub/sub** - broadcast `kb.registry/1` & `kb.health/1` payloads and react to live updates with exponential backoff + jitter
- **OpenAPI generation** - automatic spec generation from plugin manifests
- **Studio registry** - aggregated metadata for UI consumption
- **Caching** - in-memory cache with TTL layered on disk snapshot
- **Structured health** - `getSystemHealth()` returns the unified `kb.health/1` document used by REST & Studio

## Installation

```bash
pnpm add @kb-labs/cli-api
```

## Usage

### Producer Mode (REST API)

```typescript
import { createCliAPI } from '@kb-labs/cli-api';

const cli = await createCliAPI({
  discovery: {
    strategies: ['workspace', 'pkg', 'dir', 'file'],
    roots: [process.cwd()],
  },
  cache: {
    inMemory: true,
    ttlMs: 30_000,
  },
  snapshot: {
    mode: 'producer',
    refreshIntervalMs: 60_000,
  },
  pubsub: {
    redisUrl: process.env.KB_REDIS_URL,
    namespace: 'kb',
    reconnect: {
      initialDelayMs: 500,
      maxDelayMs: 30_000,
      jitter: 0.2,
    },
  },
});

await cli.initialize();
const snapshot = cli.snapshot(); // persisted to .kb/cache/registry.json
await cli.publish(); // implicit via refresh()
```

### Consumer Mode (read-only service)

```typescript
const cli = await createCliAPI({
  snapshot: {
    mode: 'consumer',
  },
  pubsub: {
    redisUrl: process.env.KB_REDIS_URL,
    namespace: 'kb',
  },
});

await cli.initialize(); // loads existing snapshot, listens for kb:registry:changed
cli.onChange(() => {
  console.log('Snapshot updated:', cli.snapshot().rev);
});
```

### Basic Operations

```typescript
const plugins = await cli.listPlugins();
const manifest = await cli.getManifestV2('@kb-labs/ai-review');
const spec = await cli.getOpenAPISpec('@kb-labs/ai-review');
const registry = await cli.getStudioRegistry();
const health = await cli.getSystemHealth();
```

## API Reference

### `createCliAPI(opts?: CliInitOptions): Promise<CliAPI>`

Creates and initializes a CLI API instance.

```typescript
interface CliInitOptions {
  discovery?: {
    strategies?: Array<'workspace' | 'pkg' | 'dir' | 'file'>;
    roots?: string[];
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
  snapshot?: {
    mode?: 'producer' | 'consumer';
    refreshIntervalMs?: number;
  };
  pubsub?: {
    redisUrl?: string;
    namespace?: string;
    registryChannel?: string;
    healthChannel?: string;
    reconnect?: {
      initialDelayMs?: number;
      maxDelayMs?: number;
      jitter?: number;
    };
  };
}
```

### `CliAPI.initialize(): Promise<void>`

Runs discovery (producer) or loads a persisted snapshot (consumer). Starts periodic refresh when `snapshot.refreshIntervalMs` is provided.

### `CliAPI.listPlugins(): Promise<PluginBrief[]>`

Returns all discovered plugins (producer) or cached snapshot plugins (consumer).

### `CliAPI.getManifestV2(pluginId: string): Promise<ManifestV2 | null>`

Returns the V2 manifest for a specific plugin.

### `CliAPI.getOpenAPISpec(pluginId: string): Promise<OpenAPISpec | null>`

Generates OpenAPI specification for a plugin.

### `CliAPI.getStudioRegistry(): Promise<StudioRegistry>`

Returns aggregated registry for Studio UI.

### `CliAPI.refresh(): Promise<void>`

Producer: reruns discovery, persists snapshot, publishes pub/sub events. Consumer: reloads snapshot from disk if newer.

### `CliAPI.snapshot(): RegistrySnapshot`

Returns the latest persisted `kb.registry/1` snapshot (`rev`, `generatedAt`, TTL, partial/stale flags, manifests with plugin roots). Consumers avoid hitting the filesystem repeatedly by caching in memory.

### `CliAPI.getSystemHealth(options?: SystemHealthOptions): Promise<SystemHealthSnapshot>`

Returns the consolidated `kb.health/1` payload, including registry counts, partial/stale flags, unmatched errors, and plugin component details. Used by REST `/health`, Studio readiness banner, and pub/sub announcements.

### `CliAPI.onChange(handler: (diff: RegistryDiff) => void): () => void`

Registers a listener for registry changes. In consumer mode the callback fires whenever a newer snapshot is observed via pub/sub events.

### `CliAPI.dispose(): Promise<void>`

Stops periodic refresh, tears down Redis connections, and disposes the underlying registry.

## Snapshot Schema

```typescript
interface RegistrySnapshot {
  schema: 'kb.registry/1';
  rev: number;
  generatedAt: string;
  expiresAt?: string;
  ttlMs?: number;
  partial: boolean;
  stale: boolean;
  source: {
    cliVersion: string;
    cwd: string;
  };
  plugins: PluginBrief[];
  manifests: Array<{
    pluginId: string;
    pluginRoot: string;
    manifest: ManifestV2;
    source: PluginBrief['source'];
  }>;
}
```

## Health Schema

```typescript
interface SystemHealthSnapshot {
  schema: 'kb.health/1';
  ts: string;
  uptimeSec: number;
  version: {
    kbLabs: string;
    cli: string;
    rest: string;
    studio?: string;
    git?: { sha: string; dirty: boolean };
  };
  registry: {
    total: number;
    withRest: number;
    withStudio: number;
    errors: number;
    generatedAt: string;
    expiresAt?: string;
    partial: boolean;
    stale: boolean;
  };
  status: 'healthy' | 'degraded';
  components: Array<{
    id: string;
    version?: string;
    restRoutes?: number;
    studioWidgets?: number;
    lastError?: string;
  }>;
  meta?: Record<string, unknown>;
}
```

## Pub/Sub Payloads

Producer mode publishes minimal envelopes for low-latency consumers:

```json
{ "schema": "kb.registry/1", "rev": 42, "generatedAt": "2025-11-08T10:15:32Z" }
{ "schema": "kb.health/1", "status": "degraded", "ts": "2025-11-08T10:15:35Z" }
```

Consumers compare `rev` before reloading snapshots, avoiding redundant disk reads.

## License

MIT

