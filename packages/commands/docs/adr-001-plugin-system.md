# ADR-001: Plugin System Architecture

**Status:** Accepted  
**Date:** 2024-12-XX  
**Deciders:** KB Labs Team

## Context

KB Labs CLI needed a scalable plugin system to allow:
- External packages to contribute commands
- Workspace packages to expose CLI commands
- Local development plugins
- Security and permissions control
- Performance optimizations

## Decision

We adopted a **manifest-based plugin discovery system** with the following architecture:

### Core Principles

1. **Manifest-Driven**: Commands defined via JSON/TS manifests, not runtime registration
2. **Keyword-Based Discovery**: Plugins discovered via `keywords: ["kb-cli-plugin"]` or `kb.plugin: true`
3. **Priority-Based Resolution**: `workspace > linked > allowlisted node_modules > rest`
4. **Schema Validation**: Zod schemas for strict manifest validation
5. **Security-First**: 3rd-party plugins disabled by default, require allowlist/enable

### Discovery Flow

```
1. Check cache (with invalidation triggers)
2. Discover workspace packages (pnpm-workspace.yaml)
3. Discover node_modules (keyword-based scan)
4. Apply allowlist/blocklist (kb-labs.config.json)
5. Load and validate manifests (Zod schema)
6. Register with collision detection
7. Save cache
```

### Caching Strategy

Cache invalidated on:
- Node version change
- CLI version change
- Lockfile hash change (pnpm-lock.yaml)
- Config hash change (kb-labs.config.json)
- Plugin state hash change (.kb/plugins.json)
- Package mtime/manifest hash change

### Security Model

- **Default Deny**: 3rd-party plugins disabled by default
- **Permissions**: Declarative permissions system (`fs.read`, `fs.write`, `git.read`, `net.fetch`)
- **Timeouts**: 5-minute execution timeout per command
- **Quarantine**: Auto-disable after 3 consecutive crashes
- **Integrity**: SRI hash support for package verification

## Consequences

### Positive

- ✅ Scalable: Keyword discovery scales to 100s of packages
- ✅ Secure: Default deny + permissions + timeouts
- ✅ Fast: Caching reduces discovery time from 500ms to <50ms
- ✅ Flexible: Workspace, npm, linked plugins all supported

### Negative

- Requires manifest structure (learning curve)
- Cache invalidation complexity
- Zod schema maintenance overhead

### Trade-offs

- **Keyword scan vs explicit config**: Chose keywords for DX, config for security
- **Cache complexity vs performance**: Chose complexity for 10x speedup
- **Zod validation vs runtime errors**: Chose strict validation for earlier feedback

## Alternatives Considered

1. **Runtime Registration**: Rejected - harder to discover, no static analysis
2. **Explicit Config Only**: Rejected - worse DX for workspace packages
3. **No Caching**: Rejected - too slow for large projects

## Implementation Notes

- Discovery happens synchronously during CLI startup
- Lifecycle hooks (`init`, `register`, `dispose`) optional
- Namespacing: `namespace:command` format for IDs
- Whitespace aliases: `devlink:apply` → `devlink apply` automatically

