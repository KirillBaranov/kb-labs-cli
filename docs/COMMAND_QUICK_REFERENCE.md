# Command Registration Quick Reference

## File Structure

```
packages/commands/src/
├── commands/
│   ├── system/           # Standalone commands
│   │   ├── hello.ts
│   │   ├── version.ts
│   │   └── diagnose.ts
│   ├── devlink/          # DevLink product group
│   │   ├── plan.ts
│   │   ├── apply.ts
│   │   └── index.ts
│   └── profiles/         # Profiles product group
│       ├── validate.ts
│       ├── resolve.ts
│       └── index.ts
├── utils/
│   ├── registry.ts       # Command registry
│   ├── register.ts       # Registration logic
│   └── help-generator.ts # Help text generation
└── types/
    └── types.ts          # Command interfaces
```

## Command Template

### Standalone Command

```typescript
// packages/commands/src/commands/system/mycommand.ts
import type { Command } from "../../types";

export const mycommand: Command = {
  name: "mycommand",
  category: "system",
  describe: "Brief description",
  longDescription: "Detailed description",
  flags: [
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: ["kb mycommand", "kb mycommand --json"],
  async run(ctx, argv, flags) {
    // Implementation
    return 0;
  }
};
```

### Group Command

```typescript
// packages/commands/src/commands/myproduct/mysubcommand.ts
import type { Command } from "../../types";

export const mysubcommand: Command = {
  name: "mysubcommand",
  category: "myproduct",
  describe: "Brief description",
  aliases: ["myproduct:mysubcommand"], // Backward compatibility
  flags: [
    { name: "dry-run", type: "boolean", description: "Show what would be done" },
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: [
    "kb myproduct mysubcommand",
    "kb myproduct mysubcommand --dry-run"
  ],
  async run(ctx, argv, flags) {
    // Implementation
    return 0;
  }
};
```

### Group Index

```typescript
// packages/commands/src/commands/myproduct/index.ts
import type { CommandGroup } from "../../types";
import { mysubcommand } from './mysubcommand';

export const myproductGroup: CommandGroup = {
  name: "myproduct",
  describe: "My Product - Brief description",
  commands: [mysubcommand]
};

// Backward compatibility
export { mysubcommand as myproductMysubcommand };
```

## Registration Steps

### 1. Standalone Command

1. Create command file in `commands/system/`
2. Add to `utils/register.ts`:
   ```typescript
   registry.register(mycommand);
   ```
3. Export in `index.ts`:
   ```typescript
   export { mycommand } from "./commands/system/mycommand";
   ```

### 2. Group Command

1. Create command file in `commands/myproduct/`
2. Create/update `commands/myproduct/index.ts`
3. Add to `utils/register.ts`:
   ```typescript
   registry.registerGroup(myproductGroup);
   ```

## Flag Types

```typescript
// Boolean flag
{ name: "verbose", type: "boolean", description: "Enable verbose output" }

// String flag with choices
{ name: "mode", type: "string", choices: ["local", "remote"], default: "local" }

// Required string flag
{ name: "config", type: "string", required: true, description: "Config file path" }

// Array flag
{ name: "include", type: "array", description: "Files to include" }
```

## Common Patterns

### JSON Output

```typescript
if (flags.json) {
  ctx.presenter.json({ ok: true, data: result });
} else {
  ctx.presenter.write("Human readable output");
}
```

### Error Handling

```typescript
try {
  // Command logic
  return 0;
} catch (error) {
  if (flags.json) {
    ctx.presenter.json({ ok: false, error: error.message });
  } else {
    ctx.presenter.error(`❌ Command failed: ${error.message}`);
  }
  return 1;
}
```

### Dry Run

```typescript
const dryRun = flags["dry-run"] as boolean;

if (dryRun) {
  ctx.presenter.write("Would perform action...");
} else {
  // Actually perform action
}
```

## Testing Commands

```bash
# Test command
pnpm kb mycommand

# Test with flags
pnpm kb mycommand --verbose --json

# Test group command
pnpm kb myproduct mysubcommand

# Test backward compatibility
pnpm kb myproduct:mysubcommand

# Test help
pnpm kb myproduct --help
```

## Exit Codes

- `0` - Success
- `1` - Error
- `2` - Warning (e.g., dry run, validation issues)

## Best Practices

1. **Always include `--json` flag** for commands with output
2. **Use `--dry-run`** for commands that make changes
3. **Provide meaningful examples** in the `examples` array
4. **Include `aliases`** for backward compatibility
5. **Return appropriate exit codes**
6. **Handle both text and JSON output modes**
7. **Use consistent naming** (kebab-case for commands)
8. **Write clear descriptions** for commands and flags
