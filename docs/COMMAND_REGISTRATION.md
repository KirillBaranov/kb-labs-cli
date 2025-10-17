# Command Registration Guide

This guide explains how to register new commands in the KB Labs CLI using the new git-style command groups architecture.

## Overview

The CLI now supports two types of commands:
- **Standalone commands**: Direct commands like `kb hello`, `kb version`
- **Group commands**: Commands organized by product like `kb devlink plan`, `kb profiles validate`

## Command Structure

### 1. Command Interface

All commands must implement the `Command` interface:

```typescript
interface Command {
  name: string;                    // Short name within group: "plan"
  describe: string;                // Brief description
  longDescription?: string;        // Detailed description for help
  category?: string;               // "devlink" | "profiles" | "system"
  aliases?: string[];              // ["devlink:plan"] for backward compatibility
  flags?: FlagDefinition[];        // Flag metadata for help generation
  examples?: string[];             // Usage examples
  run: CommandRun;                 // Command implementation
}
```

### 2. Flag Definition

Define command flags using the `FlagDefinition` interface:

```typescript
interface FlagDefinition {
  name: string;                    // "dry-run", "mode", "json"
  type: "boolean" | "string" | "number" | "array";
  alias?: string;                  // Short alias: "d"
  description?: string;            // Flag description
  default?: unknown;               // Default value
  required?: boolean;              // Whether flag is required
  choices?: string[];              // Valid choices for enum flags
}
```

## Registration Methods

### Method 1: Standalone Commands

For system-level commands that don't belong to a specific product:

1. **Create the command file** in `packages/commands/src/commands/system/`:

```typescript
// packages/commands/src/commands/system/mycommand.ts
import type { Command } from "../../types";

export const mycommand: Command = {
  name: "mycommand",
  category: "system",
  describe: "Brief description of what the command does",
  longDescription: "Detailed explanation of the command's functionality and use cases",
  flags: [
    { name: "verbose", type: "boolean", description: "Enable verbose output" },
    { name: "config", type: "string", description: "Path to config file" }
  ],
  examples: [
    "kb mycommand",
    "kb mycommand --verbose",
    "kb mycommand --config=./myconfig.json"
  ],
  async run(ctx, argv, flags) {
    // Command implementation
    ctx.presenter.write("Hello from mycommand!");
    return 0;
  }
};
```

2. **Register the command** in `packages/commands/src/utils/register.ts`:

```typescript
import { mycommand } from "../commands/system/mycommand";

export function registerBuiltinCommands() {
  // ... existing code ...
  
  // Standalone commands
  registry.register(hello);
  registry.register(version);
  registry.register(diagnose);
  registry.register(mycommand); // Add your command here
}
```

3. **Export the command** in `packages/commands/src/index.ts`:

```typescript
export { mycommand } from "./commands/system/mycommand";
```

### Method 2: Group Commands

For commands that belong to a product group (recommended for most commands):

1. **Create the command file** in the appropriate group directory:

```typescript
// packages/commands/src/commands/myproduct/mysubcommand.ts
import type { Command } from "../../types";

export const mysubcommand: Command = {
  name: "mysubcommand",
  category: "myproduct",
  describe: "Brief description of the subcommand",
  longDescription: "Detailed explanation of the subcommand's functionality",
  aliases: ["myproduct:mysubcommand"], // For backward compatibility
  flags: [
    { name: "dry-run", type: "boolean", description: "Show what would be done without making changes" },
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: [
    "kb myproduct mysubcommand",
    "kb myproduct mysubcommand --dry-run",
    "kb myproduct mysubcommand --json"
  ],
  async run(ctx, argv, flags) {
    // Command implementation
    const dryRun = flags["dry-run"] as boolean;
    const json = flags.json as boolean;
    
    if (json) {
      ctx.presenter.json({ ok: true, message: "Command executed" });
    } else {
      ctx.presenter.write("Executing mysubcommand...");
      if (dryRun) {
        ctx.presenter.write(" (dry run)");
      }
    }
    
    return 0;
  }
};
```

2. **Create or update the group index** file:

```typescript
// packages/commands/src/commands/myproduct/index.ts
import type { CommandGroup } from "../../types";
import { mysubcommand } from './mysubcommand';
// Import other commands in the group

export const myproductGroup: CommandGroup = {
  name: "myproduct",
  describe: "My Product - Brief description of what this product does",
  commands: [mysubcommand] // Add all commands in this group
};

// Backward compatibility exports
export { mysubcommand as myproductMysubcommand };
```

3. **Register the group** in `packages/commands/src/utils/register.ts`:

```typescript
import { myproductGroup } from "../commands/myproduct";

export function registerBuiltinCommands() {
  // ... existing code ...
  
  // Register command groups
  registry.registerGroup(devlinkGroup);
  registry.registerGroup(profilesGroup);
  registry.registerGroup(myproductGroup); // Add your group here
}
```

## Best Practices

### 1. Command Naming

- Use **kebab-case** for command names: `my-subcommand`
- Keep names **short and descriptive**
- Use **verbs** for actions: `plan`, `apply`, `validate`
- Use **nouns** for queries: `status`, `info`, `list`

### 2. Flag Design

- Always include `--json` flag for commands that produce output
- Use `--dry-run` for commands that make changes
- Provide meaningful descriptions for all flags
- Set appropriate defaults
- Use `choices` for enum-like flags

### 3. Help Text

- Write clear, concise descriptions
- Provide practical examples
- Include both simple and complex usage patterns
- Use consistent terminology across commands

### 4. Error Handling

- Return appropriate exit codes (0 = success, 1 = error, 2 = warning)
- Provide helpful error messages
- Support both text and JSON error output
- Handle edge cases gracefully

### 5. Backward Compatibility

- Always include `aliases` with the old format for existing commands
- Maintain the same JSON output structure
- Don't break existing command behavior

## Examples

### Complete Standalone Command

```typescript
// packages/commands/src/commands/system/health.ts
import type { Command } from "../../types";

export const health: Command = {
  name: "health",
  category: "system",
  describe: "Check system health and dependencies",
  longDescription: "Performs a comprehensive health check of the system, including dependency validation, configuration verification, and environment checks.",
  flags: [
    { name: "verbose", type: "boolean", description: "Show detailed health information" },
    { name: "fix", type: "boolean", description: "Attempt to fix common issues automatically" },
    { name: "json", type: "boolean", description: "Output results in JSON format" }
  ],
  examples: [
    "kb health",
    "kb health --verbose",
    "kb health --fix",
    "kb health --json"
  ],
  async run(ctx, argv, flags) {
    const verbose = flags.verbose as boolean;
    const fix = flags.fix as boolean;
    const json = flags.json as boolean;
    
    // Health check implementation
    const results = {
      ok: true,
      checks: [
        { name: "dependencies", status: "ok" },
        { name: "configuration", status: "ok" },
        { name: "environment", status: "warning" }
      ]
    };
    
    if (json) {
      ctx.presenter.json(results);
    } else {
      ctx.presenter.write("🏥 System Health Check\n");
      ctx.presenter.write("=====================\n\n");
      
      for (const check of results.checks) {
        const icon = check.status === "ok" ? "✅" : "⚠️";
        ctx.presenter.write(`${icon} ${check.name}: ${check.status}\n`);
      }
    }
    
    return results.ok ? 0 : 1;
  }
};
```

### Complete Group Command

```typescript
// packages/commands/src/commands/deploy/build.ts
import type { Command } from "../../types";

export const build: Command = {
  name: "build",
  category: "deploy",
  describe: "Build the project for deployment",
  longDescription: "Compiles and packages the project for deployment, including asset optimization, dependency bundling, and environment-specific configurations.",
  aliases: ["deploy:build"],
  flags: [
    { name: "target", type: "string", choices: ["production", "staging", "development"], default: "production", description: "Build target environment" },
    { name: "optimize", type: "boolean", default: true, description: "Enable build optimizations" },
    { name: "watch", type: "boolean", description: "Watch for changes and rebuild automatically" },
    { name: "json", type: "boolean", description: "Output build results in JSON format" }
  ],
  examples: [
    "kb deploy build",
    "kb deploy build --target=staging",
    "kb deploy build --no-optimize",
    "kb deploy build --watch"
  ],
  async run(ctx, argv, flags) {
    const target = flags.target as string;
    const optimize = flags.optimize as boolean;
    const watch = flags.watch as boolean;
    const json = flags.json as boolean;
    
    // Build implementation
    const startTime = Date.now();
    
    try {
      // Simulate build process
      ctx.presenter.write(`🔨 Building for ${target}...\n`);
      
      if (optimize) {
        ctx.presenter.write("⚡ Optimizing assets...\n");
      }
      
      if (watch) {
        ctx.presenter.write("👀 Watching for changes...\n");
      }
      
      const duration = Date.now() - startTime;
      const result = {
        ok: true,
        target,
        optimize,
        watch,
        duration,
        artifacts: ["dist/app.js", "dist/app.css"]
      };
      
      if (json) {
        ctx.presenter.json(result);
      } else {
        ctx.presenter.write(`✅ Build completed in ${duration}ms\n`);
        ctx.presenter.write(`📦 Artifacts: ${result.artifacts.join(", ")}\n`);
      }
      
      return 0;
    } catch (error) {
      const result = {
        ok: false,
        error: error.message,
        target,
        duration: Date.now() - startTime
      };
      
      if (json) {
        ctx.presenter.json(result);
      } else {
        ctx.presenter.error(`❌ Build failed: ${error.message}\n`);
      }
      
      return 1;
    }
  }
};
```

## Testing

After registering a new command, test it:

```bash
# Test the command
pnpm kb mycommand

# Test with flags
pnpm kb mycommand --verbose

# Test group commands
pnpm kb myproduct mysubcommand

# Test backward compatibility
pnpm kb myproduct:mysubcommand

# Test help
pnpm kb myproduct --help
pnpm kb myproduct mysubcommand --help
```

## Migration from Old Format

If you have existing commands using the old format, follow these steps:

1. **Update the command definition** with new interface properties
2. **Add category and aliases** for backward compatibility
3. **Move to appropriate directory** (system/ or product group/)
4. **Update registration** to use `registerGroup()` if applicable
5. **Test both formats** work correctly

This ensures a smooth transition while maintaining full backward compatibility.

## JSON Support Pattern

All commands automatically support the global `--json` flag through centralized CLI handling.

### Simple Commands (Return Payload)

For simple commands that output structured data, return an object from your command:

```typescript
export const myCommand: Command = {
  name: "my-command",
  describe: "Does something useful",
  async run(ctx, argv, flags) {
    const result = doSomething();
    
    if (flags.json) {
      // Return payload - CLI will wrap it in { ok: true, data: ... }
      return { result, timestamp: Date.now() };
    } else {
      // Text mode - use presenter
      ctx.presenter.write(`Result: ${result}`);
      return 0;
    }
  }
};
```

The CLI will automatically wrap your return value:
```json
{
  "ok": true,
  "data": {
    "result": "...",
    "timestamp": 1234567890
  }
}
```

### Complex Commands (Manual JSON Control)

For commands with complex output or streaming needs, call `presenter.json()` directly and set `ctx.sentJSON = true`:

```typescript
export const complexCommand: Command = {
  name: "complex",
  describe: "Complex operation",
  async run(ctx, argv, flags) {
    const result = await doComplexOperation();
    
    if (flags.json) {
      ctx.presenter.json({
        ok: result.success,
        data: result.data,
        meta: {
          duration: result.duration,
          warnings: result.warnings,
        },
        timings: result.timings,
      });
      ctx.sentJSON = true;  // Tell CLI we handled JSON output
      return result.success ? 0 : 1;
    } else {
      // Text mode rendering
      renderTextOutput(ctx, result);
      return result.success ? 0 : 1;
    }
  }
};
```

### Warnings and Diagnostics

Use `ctx.diagnostics` array to collect warnings that should appear in JSON output:

```typescript
async run(ctx, argv, flags) {
  if (someWarningCondition) {
    ctx.diagnostics.push("Warning: something deprecated");
  }
  
  if (flags.json) {
    return { status: "ok" };  // CLI adds warnings automatically
  } else {
    ctx.presenter.warn("Warning: something deprecated");
    ctx.presenter.write("Status: ok");
    return 0;
  }
}
```

### Error Handling

Errors are automatically handled by the CLI layer. Throw `CliError` for structured errors:

```typescript
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

async run(ctx, argv, flags) {
  if (invalidInput) {
    throw new CliError(
      CLI_ERROR_CODES.E_INVALID_FLAGS,
      "Invalid input provided",
      { field: "name", value: input }
    );
  }
  // ...
}
```

In JSON mode, this automatically outputs:
```json
{
  "ok": false,
  "error": {
    "code": "E_INVALID_FLAGS",
    "message": "Invalid input provided",
    "details": {
      "field": "name",
      "value": "..."
    }
  }
}
```

### Presenter Methods

The `Presenter` interface provides:

- `write(line)` - Output text (no-op in JSON mode)
- `warn(line)` - Output warning (collected in ctx.diagnostics in JSON mode)
- `error(line)` - Output error (used for non-exception errors)
- `json(payload)` - Direct JSON output (for complex commands)

### Best Practices

1. **Always check `flags.json`** - Commands must handle both modes
2. **Keep it simple** - Prefer returning payload over manual JSON control
3. **Consistent structure** - Use same field names across similar commands
4. **No side effects in JSON mode** - Don't write files or modify state without user confirmation
5. **Return proper exit codes** - 0 for success, non-zero for errors
