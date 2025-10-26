# KB Labs CLI Commands

This package contains the command implementations and registry system for KB Labs CLI.

## Plugin System

The CLI uses a plugin-based architecture where commands are defined in manifest files within their respective packages.

### Architecture

```
kb-labs-cli/packages/commands/src/
├── registry/           # Plugin discovery and registration
│   ├── types.ts       # All interfaces
│   ├── availability.ts # ESM-safe dependency resolution
│   ├── discover.ts    # Workspace + node_modules discovery
│   ├── register.ts    # Manifest validation and shadowing
│   ├── run.ts         # Command execution
│   └── __tests__/     # Comprehensive test suite
├── builtins/          # Built-in commands (legacy)
└── utils/             # Utilities (logger, path helpers)
```

### Command Manifests

Commands are defined in `cli.manifest.ts` files within their packages:

```typescript
// packages/my-package/src/cli.manifest.ts
export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: 'my:command',
    aliases: ['my-command'],
    group: 'my',
    describe: 'My command description',
    requires: ['@kb-labs/some-dependency'],
    flags: [
      {
        name: 'verbose',
        type: 'boolean',
        alias: 'v',
        description: 'Verbose output',
      },
    ],
    examples: [
      'kb my command --verbose',
    ],
    loader: async () => import('./cli/command.js'),
  },
];
```

### Package.json Configuration

Add the manifest reference to your package.json:

```json
{
  "name": "@kb-labs/my-package",
  "kb": {
    "commandsManifest": "./dist/cli.manifest.js"
  }
}
```

## Global Flags

All commands receive these global flags regardless of their own flag definitions:

- `--json` - JSON output mode
- `--only-available` - Filter unavailable commands (help only)
- `--no-cache` - Force discovery refresh
- `--verbose` - Detailed output
- `--quiet` - Minimal output
- `--help` - Show help
- `--version` - Show version

These flags are guaranteed to be passed through to all commands.

## Exit Codes

- **0** - Success
- **1** - Command error / invalid module
- **2** - Command unavailable (missing dependencies)

In `--json` mode with exit code 2:
```json
{
  "ok": false,
  "available": false,
  "command": "my:command",
  "reason": "Missing dependency: @kb-labs/some-dependency",
  "hint": "Run: kb devlink apply"
}
```

## Logging

The CLI respects the `KB_LOG_LEVEL` environment variable:

- `silent` - No output
- `error` - Error messages only
- `warn` - Warnings and errors (default)
- `info` - Informational messages
- `debug` - Debug information

All diagnostic output goes to `stderr`, leaving `stdout` free for command output.

## Discovery Process

1. **Workspace Discovery**: Scans `pnpm-workspace.yaml` for packages with `kb.commandsManifest`
2. **Node Modules Discovery**: Scans `node_modules/@kb-labs/*` for installed packages
3. **Current Package Fallback**: If no workspace file, checks current directory
4. **Shadowing**: Workspace packages shadow node_modules packages
5. **Caching**: Results are cached in `.kb/cache/cli-manifests.json`

## Command Execution

Commands are lazy-loaded when executed:

1. Check availability (dependencies)
2. Load command module via `loader()`
3. Execute with context, arguments, and flags
4. Return exit code

## Diagnostics

Use `kb plugins list` to see all discovered commands with their status:

- Available/unavailable status
- Source (workspace/node_modules/builtin)
- Shadowing information
- Missing dependency reasons and hints

## Development

### Running Tests

```bash
pnpm test
```

### Building

```bash
pnpm build
```

### Adding New Commands

1. Create `cli.manifest.ts` in your package
2. Add `kb.commandsManifest` to package.json
3. Build your package
4. Test with `kb plugins list`

## Migration from Legacy Commands

Legacy command groups are being converted to manifest format:

1. **Built-in Commands**: Converted to manifest format in `builtins/`
2. **Product Commands**: Moved to their respective packages
3. **System Commands**: Available as standalone commands

The registry system maintains backward compatibility during the transition.