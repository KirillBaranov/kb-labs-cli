# Contributing Guide

Thanks for considering a contribution to **KB Labs** projects!

---

## Development setup

```bash
pnpm i
pnpm dev
```

## 📋 Development Guidelines

### Code Style

- **Coding style**: Follow ESLint + Prettier rules. Run `pnpm lint` before pushing.
- **TypeScript**: Use strict mode and proper type annotations.
- **Testing**: Cover all changes with Vitest. Run `pnpm test` and ensure 90%+ coverage.
- **Test structure**: Organize tests in `__tests__` directories at the same level as source files.
- **Documentation**: Document all public APIs and complex logic.

### Commit Messages

Use conventional commit format:

```
feat: add new feature
fix: correct bug
docs: update documentation
refactor: restructure code
test: add or update tests
chore: maintenance tasks
```

### Architecture Decisions

- For significant architectural changes, add an ADR in `docs/adr/`
- Follow the ADR template in `docs/adr/0000-template.md`
- Include required metadata (Date, Status, Deciders, **Last Reviewed**, **Tags**)
- **Last Reviewed** date is required and should be updated periodically
- **Tags** are mandatory (minimum 1, maximum 5 tags from approved list)
- See [Documentation Standard](./docs/DOCUMENTATION.md) for ADR format requirements

## Adding New Commands

To add a new command to the CLI:

1. **Create command file** in `packages/commands/src/commands/<command-name>/index.ts`:
   ```typescript
   import type { Command } from "../../types";
   import { box, keyValue, formatTiming, TimingTracker } from '@kb-labs/shared-cli-ui';

   export const myCommand: Command = {
     name: "my-command",
     describe: "Description of what the command does",
     async run(ctx, args, flags) {
       const tracker = new TimingTracker();
       const jsonMode = !!flags.json;
       
       try {
         // Command implementation
         const result = await performOperation();
         
         const totalTime = tracker.total();
         
         if (jsonMode) {
           ctx.presenter.json({ 
             ok: true, 
             result, 
             timing: totalTime 
           });
         } else {
           const summary = keyValue({
             'Status': 'Success',
             'Items': result.count,
             'Mode': flags.mode || 'default',
           });
           
           const output = box('Operation Complete', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
           ctx.presenter.write(output);
         }
         
         return 0;
       } catch (e: unknown) {
         const errorMessage = e instanceof Error ? e.message : String(e);
         if (jsonMode) {
           ctx.presenter.json({ 
             ok: false, 
             error: errorMessage, 
             timing: tracker.total() 
           });
         } else {
           ctx.presenter.error(errorMessage);
         }
         return 1;
       }
     },
   };
   ```

2. **Export the command** in `packages/commands/src/commands/<command-name>/index.ts`:
   ```typescript
   export { myCommand } from "./my-command";
   ```

3. **Register the command** in `packages/commands/src/register.ts`:
   ```typescript
   import { myCommand } from "./commands/my-command";
   
   // Add to registerBuiltinCommands function
   registerCommand(myCommand);
   ```

### Command Output Standards

All commands should follow the unified output pattern for consistent user experience:

- **Use box formatting** for operations and results
- **Include timing information** for performance visibility  
- **Support `--json` flag** for machine-readable output
- **Handle errors gracefully** with proper exit codes

For detailed examples and patterns, see:
- [Command Output Guide](./docs/guides/command-output.md)
- [CLI Style Guide](./docs/guides/cli-style.md)
- [Command Registration Guide](./docs/COMMAND_REGISTRATION.md)
   ```

4. **Add tests** in `packages/commands/src/commands/<command-name>/__tests__/`:
   ```typescript
   import { describe, it, expect } from "vitest";
   import { myCommand } from "../index";

   describe("myCommand", () => {
     it("should work correctly", async () => {
       // Test implementation
     });
   });
   ```

5. **Update smoke tests** in `packages/cli/tests/smoke.spec.ts` to include your command.

6. **Update documentation** in README.md to list the new command.

## Exit Codes

Commands should return appropriate exit codes:
- `0` or `undefined`: Success
- `1`: General error
- Use `CliError` for structured error handling

## Output Formats

Commands should support both text and JSON output:
- Text mode: Use `ctx.presenter.write()` for output
- JSON mode: Use `ctx.presenter.json()` for structured output
- The `--json` flag is handled automatically by the CLI framework

## Testing Guidelines

### Test Coverage Requirements
- **Minimum coverage**: 90% for statements, branches, functions, and lines
- **Current coverage**: 94.61% (exceeds requirements)
- **Coverage is enforced**: CI will fail if coverage drops below 90%

### Test Structure
- Place tests in `__tests__` directories at the same level as source files
- Use descriptive test names and group related tests with `describe` blocks
- Test both success and error scenarios
- Mock external dependencies appropriately

### Running Tests
```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run tests in watch mode
pnpm test:watch
```

### Test Examples
```typescript
import { describe, it, expect, vi } from "vitest";
import { myFunction } from "../my-module";

describe("myFunction", () => {
  it("should handle success case", () => {
    const result = myFunction("input");
    expect(result).toBe("expected-output");
  });

  it("should handle error case", () => {
    expect(() => myFunction("invalid")).toThrow("Error message");
  });
});
```

---

## 🔄 Pull Request Process

### Before Submitting

1. **Fork** the repository and create a feature branch
2. **Make your changes** following the guidelines above
3. **Test thoroughly**:
   ```bash
   pnpm check  # Runs lint + type-check + tests
   pnpm test -- --coverage  # Ensure coverage remains above 90%
   ```
4. **Update documentation** if needed (README, API docs, ADRs)
5. **Submit a PR** with:
   - Clear description of changes
   - Reference any related issues
   - Ensure all CI checks pass

### PR Requirements

- Clear, descriptive title and description
- Reference any related issues
- Ensure all CI checks pass
- Request review from maintainers

---

**See [Documentation Standard](./docs/DOCUMENTATION.md) for complete documentation guidelines.**
