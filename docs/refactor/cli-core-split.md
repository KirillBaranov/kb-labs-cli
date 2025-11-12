# CLI / Core Split Prep

## 1. Current Package Inventory

| Package | Description | Classification |
| --- | --- | --- |
| `packages/cli` (`@kb-labs/cli-bin`) | CLI entrypoint, bin wiring, runtime bootstrap | **Stay in kb-labs-cli** |
| `packages/cli-runtime` | Middleware pipeline, formatter registry, runtime context factory | **Stay in kb-labs-cli** |
| `packages/commands` (`@kb-labs/cli-commands`) | Built-in CLI commands, plugin registry wiring | **Stay in kb-labs-cli** |
| `packages/cli-api` | Programmatic surface for invoking CLI behaviour | **Stay in kb-labs-cli** |
| `packages/adapters` | File system/env/discovery adapters consumed by core registry | **Candidate for kb-labs-core** |
| `packages/cli-core` | Thin surface: base context, resource tracker, type exports (new layering) | **Move implementation to kb-labs-core** (keep façade in CLI) |
| `packages/core` | Full command framework: registry, discovery, lifecycle, presenters | **Move to kb-labs-core** |

## 2. Target Ownership Mapping (proposed)

- Keep in **kb-labs-cli**:
  - CLI composition root (`packages/cli`), runtime orchestrator (`packages/cli-runtime`), product commands (`packages/commands`), public CLI API (`packages/cli-api`).
- Move to **kb-labs-core**:
  - Command framework (`packages/core`).
  - Adapter layer (`packages/adapters`).
  - Implementation files now living in `packages/cli-core` (context services, cache, lifecycle). After migration, retain a lightweight façade in the CLI repo that re-exports from the core package for backward compatibility.
- Move / keep in **kb-labs-shared**:
  - Any UI helpers already in `@kb-labs/shared-cli-ui` (no new actions required, but ensure future shared utilities land there instead of `packages/cli/src/shared`).

## 3. Migration Steps (draft)

1. **Create target packages in `kb-labs-core`:**
   - Add `packages/cli-core` (hosts current `packages/core` + `packages/cli-core` implementation).
   - Add `packages/cli-adapters` mirroring current adapters.
   - Update `kb-labs-core/pnpm-workspace.yaml` and root `package.json` workspaces.
2. **Move source code:**
   - Copy `kb-labs-cli/packages/core/src/**` → `kb-labs-core/packages/cli-core/src`.
   - Copy `kb-labs-cli/packages/cli-core/src/**` into the same target (merging base context/resource tracker areas).
   - Copy `kb-labs-cli/packages/adapters/src/**` → `kb-labs-core/packages/cli-adapters/src`.
   - Preserve existing tests/docs alongside code.
3. **Update package manifests:**
   - Adjust `package.json`, `tsconfig`, `tsup.config.ts`, `vitest.config.ts` in the new packages to reflect destinations.
   - In `kb-labs-cli`, keep thin façade packages:
     - Replace `packages/cli-core` contents with re-exports of `@kb-labs/core-cli` (or new name) from `kb-labs-core`.
     - Replace `packages/adapters` with re-export barrel referencing new core package (if CLI still needs local workspace copy).
   - Switch dependency specifiers in CLI packages (`cli`, `cli-runtime`, `commands`, `cli-api`) from local workspace links to the new `kb-labs-core` packages (`workspace:*`).
4. **Adjust tooling & build configs:**
   - Update `tsconfig.base.json` path mappings in both repos to point to new locations.
   - Update `pnpm-workspace.yaml` in `kb-labs-cli` to remove moved packages; add matching entries in `kb-labs-core`.
   - Update `tsup` externals to reference new package names.
5. **Refactor imports:**
   - In CLI code, replace imports from `@kb-labs/cli-core`/adapters to point at the relocated packages (or façade).
   - In other repos that currently reference `@kb-labs/cli-core` from the CLI repo (e.g. `kb-labs-core/packages/cli`), update to consume the new source-of-truth.
6. **Cleanup:**
   - Remove now-empty directories from `kb-labs-cli` once façade approach confirmed.
   - Ensure docs in `kb-labs-cli/docs` referencing core internals are migrated or updated to point at `kb-labs-core`.

## 4. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Workspace dependency cycles** between `kb-labs-cli` and `kb-labs-core` after moving `@kb-labs/cli-core` | Builds may fail if both repos depend on each other | Make `kb-labs-cli` depend on published/linked `@kb-labs/core-cli`; ensure `kb-labs-core` no longer depends on packages inside `kb-labs-cli` (update its `package.json` first) |
| **Rename collisions** (`@kb-labs/cli-core` currently defined in two places) | pnpm may hoist unpredictable version | Rename the new source-of-truth (e.g. `@kb-labs/core-cli`) or ensure only one definition exists before bootstrap |
| **Broken import paths** across repos | Runtime errors and TS failures | Provide codemods/script to rewrite imports (`@kb-labs/cli-core/...` → new package). Update path aliases and enforce via lint rule |
| **Test/coverage gaps** after move | Regression risk | Run full `pnpm test --filter` in both repos after migration; ensure moved tests accompany code |
| **Docs drift** | Developers reference stale paths | Update CLI docs to link to `kb-labs-core` docs; add migration note in both repos |
| **Release coordination** | Consumers might expect packages in old location | Plan coordinated release (tag both repos, update changelog). Provide transitional façade packages with deprecation warning |
