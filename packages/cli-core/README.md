# @kb-labs/cli-core

Compatibility wrapper re-exporting `@kb-labs/core-cli` for the KB Labs CLI workspace.

## Vision & Purpose

**@kb-labs/cli-core** exists as a thin compatibility layer inside the `kb-labs-cli` repo.  
It re-exports the real CLI core implementation from `@kb-labs/core-cli` (in `kb-labs-core`) so that:

- the CLI workspace can depend on a local package name that matches the published one;
- tooling and examples can import `@kb-labs/cli-core` without reaching into `kb-labs-core` internals directly.

> All domain logic lives in `@kb-labs/core-cli`. This package should stay as small and boring as possible.

## Package Status

- **Version**: 0.1.0  
- **Stage**: Stable (shim)  
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
@kb-labs/cli-core (this package)
    │
    └──► @kb-labs/core-cli (real implementation, in kb-labs-core/packages/cli-core)
```

### Exports

`src/index.ts` re-exports:

- types such as `PluginBrief`, `RegistrySnapshot`, `CliContext`, `DiscoveryOptions`, etc.;
- cache interfaces and implementations (`CacheAdapter`, `InMemoryCacheAdapter`);
- `createBaseContext` helper.

No additional logic is added on top of `@kb-labs/core-cli`.

## Dependencies

### Runtime

- `@kb-labs/core-cli`: link to `../../../kb-labs-core/packages/cli-core`

### Development

- `tsup`, `vitest`, `rimraf`

## Scripts

From the monorepo root:

```bash
pnpm --filter @kb-labs/cli-core build
pnpm --filter @kb-labs/cli-core test
```

In most cases you should work directly with `@kb-labs/core-cli`; this wrapper is present for compatibility only.


