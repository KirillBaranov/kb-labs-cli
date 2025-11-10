---
title: KB Labs CLI – Target Layering Contract
description: Agreed module boundaries and dependency rules for the refactor.
---

## Layers & responsibilities

| Layer | Location | Responsibilities | Allowed dependencies |
| --- | --- | --- | --- |
| Entry (`cli`) | `packages/cli` | CLI binary wiring, argument parsing orchestration, presenter selection, process exit codes | runtime, commands, adapters (via runtime), core |
| Runtime (`cli-runtime`) | `packages/cli-runtime` | Context wiring, middleware orchestration, formatter registry, shared I/O wrappers | core (context contracts), adapters (fs/env/telemetry), shared utils |
| Domain (`commands`) | `packages/cli-commands` | Built-in commands, command registry, manifest discovery, help rendering | core (types, presenters), runtime (format helpers), shared utils, adapters (through abstractions) |
| Framework (`core`) | `packages/core` | Command execution framework, context factory, lifecycle management, presenters, discovery/caching | Node stdlib, shared utils |
| Adapters (`adapters`) | `packages/adapters` | Bridge to environment (filesystem, stdin, workspace discovery, telemetry sinks) | Node stdlib, shared utils |
| Shared utilities | `../kb-labs-shared/packages/cli-ui/src` | Pure, stateless helpers (string formatting, path normalization, schema transforms) | Node stdlib only |

## Import rules

1. `packages/cli` must only reach into:
   - `@kb-labs/cli-runtime` for context/bootstrap helpers.
   - `@kb-labs/cli-commands` for registry interaction.
   - Presenters & error types via `@kb-labs/cli-core`.
  - Shared utilities via `@kb-labs/shared-cli-ui`.
2. `packages/cli-commands` MUST NOT import from `packages/cli` directly.
3. `packages/cli-runtime` provides a service locator style surface (`createCliRuntime`, `createPresenterFactory`, etc.) to decouple entry point from command details.
4. `packages/core` re-exports only framework contracts; consumers outside the CLI should not depend on adapter implementations.
5. `packages/adapters` expose interfaces under `@kb-labs/cli-adapters` that can be swapped when we extract to separate package.
6. Shared utilities must be side-effect free and should not depend on command or runtime specifics.

## Barrel surface updates

- `@kb-labs/cli-core` will use grouped re-exports (`framework`, `presenters`, `errors`, `types`) to clarify consumption points.
- `@kb-labs/cli-runtime` exposes `createCliRuntime()` alongside middleware/formatter helpers.
- `@kb-labs/shared-cli-ui` exposes shared helpers to enforce single import location.

## Enforcement checklist

- [ ] Update TypeScript path aliases (tsconfig) once runtime/shared folders are materialized.
- [ ] Add lint rule (future) to forbid disallowed cross-package imports.
- [ ] Document optional plugin interface dependence in `docs/adr`.

