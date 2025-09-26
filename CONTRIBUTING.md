# Contributing Guide

Thanks for considering a contribution to **KB Labs** projects!

---

## Development setup

```bash
pnpm i
pnpm dev
```

## Guidelines

- **Coding style**: follow ESLint + Prettier rules. Run `pnpm lint` before pushing.
- **Testing**: cover all changes with Vitest. Run `pnpm test`.
- **Commits**: use clear, conventional messages (e.g., `feat: add X`, `fix: correct Y`).
- **ADRs**: for architectural changes, add a new record in `docs/adr`.

## Adding New Commands

To add a new command to the CLI:

1. **Create command file** in `packages/commands/src/commands/<command-name>/index.ts`:
   ```typescript
   import type { Command } from "../../types";

   export const myCommand: Command = {
     name: "my-command",
     describe: "Description of what the command does",
     async run(ctx, args, flags) {
       // Command implementation
       ctx.presenter.write("Command output");
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

---

## Pull requests

1. Fork the repo and create a feature branch.
2. Make your changes.
3. Run `pnpm check` (lint + type-check + tests).
4. Submit a PR with a clear description of your changes.
