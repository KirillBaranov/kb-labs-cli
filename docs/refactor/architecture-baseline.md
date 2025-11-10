---
title: KB Labs CLI – Architecture Baseline (2025-11)
description: Snapshot of current module layering, entry points, and safety net prior to refactor.
---

## Workspace layout

- `packages/cli` – user-facing entry point (`bin.ts` → `index.ts`). Depends on `@kb-labs/cli-core`, `@kb-labs/cli-commands`, `@kb-labs/plugin-adapter-cli`, `@kb-labs/core-sys`.
- `packages/commands` – command registry, built-in command implementations, help/presentation utilities, manifest discovery.
- `packages/core` – execution framework (`parseArgs`, `createContext`, presenters, command lifecycle helpers).
- `packages/adapters` – file system/env/telemetry adapters consumed by commands and runtime.
- `packages/cli-runtime` – formatter registry and middleware manager bridging CLI core ↔ commands.
- `packages/cli-api` / `packages/cli-core` – API surface for programmatic usage and shared context/caching logic.

### Inter-package dependencies (observed)

```text
cli ─┬─> cli-core (parseArgs, CliError, presenters)
     ├─> cli-commands (registry, registerBuiltinCommands, help renderers)
     ├─> plugin-adapter-cli (logging + manifest command execution)
     └─> core-sys (LogLevel typing)

cli-commands ─┬─> cli-core (types, context contracts)
              ├─> plugin-adapter-cli (executeCommand bridge)
              └─> plugin-manifest (manifest typing)

cli-runtime ─┬─> cli-core (middleware contracts, presenters)
             └─> shared adapters (fs/env) via direct imports today

commands <─> adapters (fs/env/telemetry helpers)
commands <─> core (Cache + Context services via type imports)
```

> Note: several helpers (path resolution, formatting utilities) currently live in `packages/commands/src/utils/*` and import directly from Node.js modules; these are candidates for the upcoming shared layer.

## Command lifecycle (current)

1. `packages/cli/src/bin.ts` resolves argv and calls `run()` from `index.ts`.
2. `run()` bootstraps logging via `initCliLogging` (`@kb-labs/plugin-adapter-cli`), invokes `registerBuiltinCommands()`, then delegates to `parseArgs()` from `@kb-labs/cli-core`.
3. Normalized command path feeds `findCommand()` from `@kb-labs/cli-commands`. Missing command triggers presenter error/JSON response.
4. For command groups / product manifests, `renderGroupHelp` & `renderProductHelp` from `cli-commands` handle text output; JSON mode returns structured errors.
5. `createCliRuntime()` (`@kb-labs/cli-runtime`) builds execution context + middleware/formatter registries, presenter is selected based on `--json` / `--quiet`.
6. Command `run()` receives `ctx`, `rest argv`, and merged flags. Return value `number` becomes exit code; otherwise defaults to 0.
7. Exceptions using `CliError` are mapped via `mapCliErrorToExitCode`. Unhandled errors bubble -> presenter error and exit code 1.

## Test safety net

- `packages/cli/tests/smoke.spec.ts` – smoke tests covering CLI help/version/JSON output and exit codes.
- `packages/cli/src/__smoke__/*` – Vitest smoke suites for manifest integration (`devlink`, JSON purity, exit codes).
- `packages/cli/src/__tests__/index.test.ts` – unit coverage for argument parsing + run pipeline edge cases.
- `packages/commands/src/__tests__` – registry behaviour and built-in command tests (register, availability).
- `packages/adapters/src/**/__tests__` – FS, env, telemetry adapters.
- `packages/core/src/__tests__` – command execution, context construction, discovery manager, error handling.
- CI command `pnpm check` (lint + type-check + tests) ensures regression detection; coverage threshold enforced via `vitest config` (94.61%+).

## Refactor guardrails

- Behavioural parity verified by `pnpm test`, target smoke scenarios (`kb --help`, `kb --version`, `kb health`, manifest command call).
- Keep existing public exports from each `package.json`; any relocation must re-export to avoid breaking consumers.
- Avoid moving business logic for commands (registry definitions, manifest executes) during shared utility extraction.

