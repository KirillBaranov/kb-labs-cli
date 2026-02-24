# Changelog — @kb-labs/cli

## 1.0.0 — 2026-02-24

First stable release. Prior history represents internal R&D — this is the first versioned public release.

### Packages

| Package | Version |
|---------|---------|
| `@kb-labs/cli-bin` | 1.0.0 |
| `@kb-labs/cli-core` | 1.0.0 |
| `@kb-labs/cli-api` | 1.0.0 |
| `@kb-labs/cli-commands` | 1.0.0 |
| `@kb-labs/cli-contracts` | 1.0.0 |
| `@kb-labs/cli-runtime` | 1.0.0 |

### What's included

**`@kb-labs/cli-bin`** — `kb` binary entry point. Loads plugins, dispatches commands, handles global flags (`--help`, `--json`, `--quiet`).

**`@kb-labs/cli-core`** — v3 command framework. Plugin manifest discovery, command registration, in-process and subprocess execution backends. Backward-compatible v2 adapter included.

**`@kb-labs/cli-api`** — Programmatic API for external integrations: `createCliAPI()`, `SnapshotManager`, `HealthAggregator`. Stable interface for REST API, webhooks, and agent access.

**`@kb-labs/cli-contracts`** — Pure TypeScript type definitions: `CommandDefinition`, `Context`, `Presenter`, `Profile`. Zero runtime dependencies.

**`@kb-labs/cli-runtime`** — Command execution engine, formatters, table rendering, middleware pipeline.

**`@kb-labs/cli-commands`** — Built-in command implementations (plugins, docs, info, logs).

### Notes

- Plugin discovery caches manifest metadata — run `kb plugins clear-cache` after rebuilding a plugin
- All commands support `--json` for machine-readable output
- v2 plugin format still supported via compatibility adapter
