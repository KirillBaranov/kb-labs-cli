# ADR-0013: Separate System and Plugin Command Routing

**Date:** 2025-12-17
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-17
**Tags:** [security, cli, plugin-system, architecture, routing]

## Context

KB Labs CLI supports two fundamentally different types of commands:

1. **System Commands** - Built-in commands like `plugins:clear-cache`, `info:hello`, `plugins:list`
   - Execute in the parent process (in-process)
   - Have full access to the system
   - Defined using `defineSystemCommand()` from `@kb-labs/shared-command-kit`
   - Registered via `registry.registerGroup()`

2. **Plugin Commands** - User-defined commands from external plugins like `plugin-template:hello`
   - Execute in a subprocess (sandbox)
   - Have restricted access via permissions
   - Discovered from manifest files (JSON)
   - Registered via `registry.registerManifest()`

### The Security Problem

Before this ADR, the CLI used a unified routing mechanism where ALL commands went through the same execution path:

```typescript
// BEFORE (INSECURE):
const cmd = findCommand(cmdPath);
const manifestCmd = registry.getManifestCommand(cmdPath);
const v3ExitCode = await tryExecuteV3({ manifestCmd, ... });
```

**Security vulnerabilities:**

1. **No type distinction** - System and plugin commands were treated identically
2. **Escape via `run()` method** - A malicious plugin could provide a `run()` function in its loader and trick the CLI into executing it in-process
3. **Collision attacks** - A plugin could override a system command like `plugins:clear-cache` and gain in-process execution
4. **No priority enforcement** - System commands didn't have guaranteed priority over plugins

### Attack Scenario

A malicious plugin manifest:

```javascript
export const manifest = {
  id: 'clear-cache',  // Collision with system command
  group: 'plugins',
  loader: async () => ({
    run: async (ctx) => {
      // SECURITY BREACH: Malicious code running in parent process!
      // Has full access to filesystem, no sandbox restrictions
      await ctx.shell.exec('rm -rf /important/data');
      return 0;
    }
  })
};
```

## Decision

We implement **separate collections with collision detection** for secure command routing.

### Architecture

#### 1. Separate Collections in Registry

```typescript
class InMemoryRegistry {
  // Separate collections for security isolation
  private systemCommands = new Map<string, Command>();        // In-process
  private pluginCommands = new Map<string, RegisteredCommand>(); // Subprocess

  // Legacy unified collection for backward compatibility
  private byName = new Map<string, Command | CommandGroup>();
}
```

**Key properties:**
- `systemCommands` - Only accessible via `register()` or `registerGroup()`
- `pluginCommands` - Only accessible via `registerManifest()`
- Collections are `private` - no external access
- Plugins execute in subprocess - cannot call `register()` or `registerGroup()`

#### 2. Collision Detection in Registration

```typescript
registerManifest(cmd: RegisteredCommand): void {
  const cmdId = cmd.manifest.id;
  const hasCollision = this.systemCommands.has(cmdId);

  if (hasCollision) {
    console.warn(`Plugin command "${cmdId}" collides with system command. System command takes priority.`);
    cmd.shadowed = true;
  }

  // Store in pluginCommands (even if shadowed)
  this.pluginCommands.set(cmdId, cmd);
  this.manifests.set(cmdId, cmd);

  // Only add to byName if NO collision
  if (!hasCollision) {
    const commandAdapter = manifestToCommand(cmd);
    this.byName.set(cmdId, commandAdapter);
    // ... register aliases
  }
}
```

**Protection mechanism:**
1. Check if `cmdId` exists in `systemCommands`
2. If collision → mark as `shadowed = true` and **DO NOT** add to `byName`
3. System command remains in `byName` → always wins in routing
4. Plugin stored in `pluginCommands` for listing but not executable

#### 3. Type-Safe Routing

```typescript
export interface CommandLookupResult {
  cmd: Command | CommandGroup;
  type: 'system' | 'plugin';
}

export function findCommandWithType(nameOrPath: string | string[]): CommandLookupResult | undefined {
  return registry.getWithType(nameOrPath);
}
```

**Routing logic:**
```typescript
getWithType(nameOrPath): CommandLookupResult | undefined {
  const cmd = this.get(nameOrPath);
  if (!cmd) return undefined;

  // Groups are always system-level
  if ('commands' in cmd) {
    return { cmd, type: 'system' };
  }

  // Check systemCommands first (highest priority)
  if (this.systemCommands.has(normalizedName)) {
    return { cmd, type: 'system' };
  }

  // Check if it's a plugin command
  const manifestCmd = this.getManifestCommand(normalizedName);
  if (manifestCmd) {
    return { cmd, type: 'plugin' };
  }

  // Default to system (backward compatibility)
  return { cmd, type: 'system' };
}
```

#### 4. Secure Execution in Bootstrap

```typescript
// bootstrap.ts
const result = findCommandWithType(normalizedCmdPath);

if (result.type === 'system') {
  // System command - execute in-process via cmd.run()
  const exitCode = await result.cmd.run(context, argv, flags);
  return typeof exitCode === 'number' ? exitCode : 0;
}

if (result.type === 'plugin') {
  // Plugin command - execute in subprocess via V3 adapter
  const manifestCmd = registry.getManifestCommand(commandId);
  const v3ExitCode = await tryExecuteV3({
    context,
    commandId,
    argv,
    flags,
    manifestCmd,
  });
  return v3ExitCode;
}
```

**Execution guarantees:**
- `type='system'` → **always** executes via `cmd.run()` in-process
- `type='plugin'` → **always** executes via `tryExecuteV3()` in subprocess
- No conditional checks that can be bypassed
- Type determined by **registration method**, not runtime properties

## Security Analysis

### Attack Vectors Blocked

#### ❌ Attack 1: Override System Command
```typescript
// Malicious plugin tries to override 'plugins:clear-cache'
export const manifest = {
  id: 'clear-cache',
  group: 'plugins',
  loader: async () => ({ run: async () => { /* malicious code */ } })
};
```

**Defense:**
1. `registerManifest()` checks `systemCommands.has('clear-cache')` → `true`
2. Plugin marked as `shadowed = true`
3. Plugin **NOT** added to `byName`
4. `findCommandWithType('clear-cache')` returns system command
5. Executes system command in-process, plugin never runs

#### ❌ Attack 2: Provide `run()` Method
```typescript
// Plugin tries to escape sandbox by providing run()
loader: async () => ({
  run: async (ctx) => {
    // Attempting in-process execution
    await ctx.shell.exec('malicious-command');
    return 0;
  }
})
```

**Defense:**
1. Plugin registered via `registerManifest()` → goes to `pluginCommands`
2. `getWithType()` checks `pluginCommands` → returns `type='plugin'`
3. Bootstrap routes to `tryExecuteV3()` (subprocess)
4. `run()` method in loader is **never called** by parent process
5. Executes in subprocess with sandbox restrictions

#### ❌ Attack 3: Forge `source: 'builtin'`
```typescript
// Plugin tries to claim it's a builtin
export const manifest = {
  id: 'malicious',
  group: 'test',
  source: 'builtin',  // Trying to claim high priority
  loader: async () => ({ run: async () => 0 })
};
```

**Defense:**
1. `source` is set by `discover.ts` during filesystem scan, not read from manifest
2. Discovery sets `source: 'workspace'` or `source: 'node_modules'` based on location
3. Plugin cannot control `source` value
4. Even if `source: 'builtin'` somehow set, routing uses **collection membership**, not `source` field

#### ❌ Attack 4: Call `registerSystemCommand()` Directly
```typescript
// Plugin tries to register itself as system command
import { registry } from '@kb-labs/cli-commands';
registry.register({ name: 'hack', ... });
```

**Defense:**
1. `register()` and `registerGroup()` are public, but plugins cannot call them
2. Plugins execute in **subprocess** (child process)
3. Registry lives in **parent process**
4. No IPC method exposes `register()` or `registerGroup()`
5. Process isolation prevents access

#### ❌ Attack 5: Prototype Pollution
```typescript
// Plugin tries to modify Map.prototype
Map.prototype.has = function() { return false; };
```

**Defense:**
1. Plugin executes in **subprocess** (child process)
2. Prototype pollution in child process doesn't affect parent
3. Registry lives in parent process with clean prototypes
4. Process isolation prevents prototype pollution

### Why This Is Secure

1. **Collection-based type determination**
   - Type is determined by which collection contains the command
   - Collections are populated by **registration method**, not manifest data
   - Manifest data **cannot** influence which collection is used

2. **Registration method controls collection**
   - `register()` / `registerGroup()` → `systemCommands`
   - `registerManifest()` → `pluginCommands`
   - Only CLI code calls `register()` / `registerGroup()`
   - Plugins cannot call these methods (process isolation)

3. **Collision detection at registration**
   - Before adding to `byName`, check `systemCommands.has(id)`
   - If collision → don't add to `byName`
   - System command already in `byName` wins

4. **Routing uses collections, not properties**
   - `getWithType()` checks `systemCommands.has()` first
   - Does **not** check `cmd.run` existence (can be faked)
   - Does **not** check `source` field (can be faked in theory)
   - Only checks collection membership (cannot be faked)

5. **Process isolation**
   - Plugins run in subprocess
   - Cannot modify parent process registry
   - Cannot call parent process methods
   - Cannot pollute parent prototypes

## Implementation

### Files Changed

1. **`cli-commands/src/registry/service.ts`**
   - Added `systemCommands` and `pluginCommands` collections
   - Added `getWithType()` method
   - Modified `register()`, `registerGroup()`, `registerManifest()` to populate collections
   - Added collision detection in `registerManifest()`

2. **`cli-commands/src/index.ts`**
   - Exported `findCommandWithType()`, `CommandType`, `CommandLookupResult`

3. **`cli-bin/src/runtime/bootstrap.ts`**
   - Changed from `findCommand()` to `findCommandWithType()`
   - Added routing based on `type` field
   - `type='system'` → `cmd.run()` in-process
   - `type='plugin'` → `tryExecuteV3()` in subprocess

### Testing

Created comprehensive test suite (`cli-commands/src/registry/__tests__/collision.test.ts`):

1. ✅ **Prevent plugin from overriding system command**
2. ✅ **Prevent plugin alias from overriding system command**
3. ✅ **Route system commands to in-process execution**
4. ✅ **Route plugin commands to subprocess execution**
5. ✅ **Handle CommandGroup routing**
6. ✅ **Not add colliding plugin to byName map**
7. ✅ **Store shadowed plugins in manifests but not route to them**

All tests passing: **7/7** ✅

## Consequences

### Positive

1. ✅ **Security hardening** - Impossible for plugins to escape sandbox via command collision
2. ✅ **Clear separation** - System and plugin commands have distinct execution paths
3. ✅ **Priority enforcement** - System commands always win in collisions
4. ✅ **Backward compatible** - Existing commands continue to work
5. ✅ **Observable** - Collision warnings logged for debugging
6. ✅ **Testable** - Clear behavior that can be unit tested
7. ✅ **Simple routing** - Single `type` field determines execution path

### Negative

1. ⚠️ **Additional complexity** - Registry now maintains multiple collections
2. ⚠️ **Migration cost** - Requires rebuild and redeploy
3. ⚠️ **Console warnings** - Collision warnings may confuse users (but necessary for security)

### Neutral

1. 🔹 **Shadowed plugins still listed** - Appear in `kb plugins list` but not executable
2. 🔹 **Manual testing required** - Need to verify all system commands still work
3. 🔹 **Documentation needed** - Plugin authors need to know about collision rules

## Alternatives Considered

### Alternative 1: Check `cmd.run` at Execution Time

```typescript
if ('run' in cmd && typeof cmd.run === 'function') {
  return await cmd.run(context, argv, flags);
}
```

**Rejected because:**
- ❌ Plugins can provide fake `run()` method
- ❌ No way to distinguish real system command from fake
- ❌ Vulnerable to attack scenario described above

### Alternative 2: Use `_isSystemCommand` Flag

```typescript
interface Command {
  _isSystemCommand?: boolean;
}
```

**Rejected because:**
- ❌ Flags can be set in manifest or loader
- ❌ No enforcement that flag is set correctly
- ❌ Vulnerable to forgery

### Alternative 3: Separate `findSystemCommand()` and `findPluginCommand()`

```typescript
const systemCmd = findSystemCommand(cmdPath);
const pluginCmd = findPluginCommand(cmdPath);
```

**Rejected because:**
- ❌ Caller must know command type in advance
- ❌ More complex bootstrap logic
- ❌ Doesn't prevent collisions

### Alternative 4: Namespace Prefixes

```typescript
// System: 'system:plugins:clear-cache'
// Plugin: 'plugin:my-plugin:hello'
```

**Rejected because:**
- ❌ Breaking change for existing commands
- ❌ Ugly UX (`kb system:plugins:clear-cache`)
- ❌ Doesn't prevent collisions within namespaces

## Migration Path

### Phase 1: Implementation (Completed)
- ✅ Add separate collections to registry
- ✅ Add collision detection
- ✅ Add `getWithType()` method
- ✅ Update bootstrap routing
- ✅ Write tests

### Phase 2: Validation (In Progress)
- ⏳ Manual testing of all system commands
- ⏳ Manual testing of plugin commands
- ⏳ Check for collision warnings in logs

### Phase 3: Monitoring
- 📊 Monitor for collision warnings in production
- 📊 Track metrics: system vs plugin execution counts
- 📊 Collect feedback from plugin authors

### Phase 4: Documentation
- 📝 Update plugin development guide
- 📝 Document collision rules
- 📝 Add security best practices

## References

- [V3 Plugin System Architecture](./V3-IMPLEMENTATION-SPEC.md)
- [Sandbox Architecture Plan](./SANDBOX-ARCHITECTURE-PLAN.md)
- Code: `cli-commands/src/registry/service.ts`
- Code: `cli-bin/src/runtime/bootstrap.ts`
- Tests: `cli-commands/src/registry/__tests__/collision.test.ts`

## Open Questions

1. Should we make collision warnings **errors** instead of warnings?
   - Current: Plugin is shadowed but registered
   - Alternative: Reject plugin registration entirely

2. Should we expose `isSystemCommand()` in public API?
   - Use case: Plugin authors checking if command exists
   - Risk: Might leak implementation details

3. Should we add telemetry for collision events?
   - Helps track malicious plugins
   - Privacy concerns

## Related ADRs

- [ADR-0006: Legacy Command Migration to Manifest System](./0006-legacy-command-migration-to-manifest-system.md)
- [ADR-0010: CLI API Refactoring](./0010-cli-api-refactoring.md)
- [ADR-0012: Command Type Safety](./0012-command-type-safety.md)

---

**Last Updated:** 2025-12-17
**Next Review:** 2026-03-17 (3 months - security critical)
