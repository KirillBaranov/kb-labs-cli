# @kb-labs/cli-commands

> **Command implementations for KB Labs CLI.** Contains command implementations and registry system for KB Labs CLI with plugin-based architecture, command discovery, execution, and help generation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/cli-commands** provides command implementations and registry system for KB Labs CLI. It includes plugin-based command architecture, command discovery, execution, help generation, and built-in system commands.

### What Problem Does This Solve?

- **Command Registry**: CLI needs command registry - commands provides registry system
- **Plugin Commands**: Need plugin-based commands - commands provides plugin integration
- **Command Execution**: Need to execute commands - commands provides execution
- **Help Generation**: Need help system - commands provides help generation
- **Built-in Commands**: Need system commands - commands provides built-ins

### Why Does This Package Exist?

- **Command Centralization**: All CLI commands in one place
- **Plugin Integration**: Seamless plugin command integration
- **Registry System**: Unified command registry
- **Help System**: Consistent help generation

### What Makes This Package Unique?

- **Plugin-Based**: Commands defined in plugin manifests
- **Discovery System**: Automatic command discovery
- **Help Generation**: Rich help system with grouping
- **Built-in Commands**: System commands (health, diagnose, plugins, etc.)

## 📊 Package Status

### Development Stage

- [x] **Experimental** - Early development, API may change
- [x] **Alpha** - Core features implemented, testing phase
- [x] **Beta** - Feature complete, API stable, production testing
- [x] **Stable** - Production ready, API frozen
- [ ] **Maintenance** - Bug fixes only, no new features
- [ ] **Deprecated** - Will be removed in future version

**Current Stage**: **Stable**

**Target Stage**: **Stable** (maintained)

### Maturity Indicators

- **Test Coverage**: ~85% (target: 90%)
- **TypeScript Coverage**: 100% (target: 100%)
- **Documentation Coverage**: 70% (target: 100%)
- **API Stability**: Stable
- **Breaking Changes**: None in last 6 months
- **Last Major Version**: 0.1.0
- **Next Major Version**: 1.0.0

### Production Readiness

- [x] **API Stability**: API is stable
- [x] **Error Handling**: Comprehensive error handling
- [x] **Logging**: Structured logging
- [x] **Testing**: Unit tests, integration tests, E2E tests present
- [x] **Performance**: Efficient command execution
- [x] **Security**: Input validation, sandbox support
- [x] **Documentation**: API documentation
- [x] **Migration Guide**: N/A (no breaking changes)

## 🏗️ Architecture

### High-Level Architecture

The commands package provides command system:

```
Command System
    │
    ├──► Registry (discovery, registration)
    ├──► Command Execution (run commands)
    ├──► Help Generation (global, group, manifest)
    ├──► Built-in Commands (system commands)
    └──► Plugin Integration (plugin commands)
```

### Core Components

#### Command Registry

- **Purpose**: Discover and register commands
- **Responsibilities**: Plugin discovery, manifest validation, command registration
- **Dependencies**: cli-core, plugin-manifest

#### Command Execution

- **Purpose**: Execute commands
- **Responsibilities**: Command routing, handler execution, error handling
- **Dependencies**: Registry, cli-core

#### Help Generation

- **Purpose**: Generate help output
- **Responsibilities**: Global help, group help, manifest help
- **Dependencies**: Registry

### Design Patterns

- **Registry Pattern**: Command registry
- **Plugin Pattern**: Plugin-based commands
- **Strategy Pattern**: Multiple discovery strategies
- **Command Pattern**: Command execution

### Data Flow

```
CLI Entry Point
    │
    ├──► Discover plugins
    ├──► Register commands
    ├──► Parse arguments
    ├──► Find command
    ├──► Execute command
    └──► Return result
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/cli-commands
```

### Basic Usage

```typescript
import { discoverManifests, registerCommands } from '@kb-labs/cli-commands';

const manifests = await discoverManifests(process.cwd());
const registry = await registerCommands(manifests);
```

## ✨ Features

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

### Plugin Manifest v2

Commands ship as part of plugin manifests declared via ManifestV2:

```typescript
// packages/my-plugin/src/kb/manifest.ts
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  version: '0.1.0',
  display: {
    name: 'My Plugin',
    description: 'Example plugin command set',
  },
  permissions: {
    fs: { mode: 'read', allow: ['.'] },
  },
  cli: {
    commands: [
      {
        id: 'my:command',
        group: 'my',
        describe: 'My command description',
        handler: './commands/command#run',
        flags: [],
      },
    ],
  },
};
```

The CLI registry converts these declarations into internal command manifests during discovery.

### Package.json Configuration

```json
{
  "name": "@kb-labs/my-plugin",
  "exports": {
    "./kb/manifest": "./dist/kb/manifest.js"
  },
  "kb": {
    "plugin": true,
    "manifest": "./dist/kb/manifest.js"
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

1. **Workspace Discovery**: Scans `pnpm-workspace.yaml` for packages exposing `./kb/manifest` via exports or `kb.manifest`.
2. **Node Modules Discovery**: Looks through installed packages for ManifestV2 files.
3. **Explicit Paths**: Follows linked directories and CLI-provided manifest paths.
4. **Shadowing**: Workspace packages shadow node_modules packages.
5. **Caching**: Results are cached in memory (and optional adapters) for fast startup.

## Command Execution

Commands execute inside the plugin sandbox:

1. Validate ManifestV2 metadata and permissions.
2. Check availability and granted permissions.
3. Execute via `@kb-labs/plugin-adapter-cli` (sandbox runtime).
4. Record telemetry and return the exit code.

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

1. Run `kb plugins scaffold my-plugin` to generate a manifest v2 skeleton.
2. Implement your command handler in `src/commands/<name>.ts`.
3. Update manifest permissions and metadata as needed.
4. Build your package and test with `kb plugins list`.

## Migration from Legacy Commands

Legacy command groups are being converted to manifest format:

1. **Built-in Commands**: Converted to manifest format in `builtins/`
2. **Product Commands**: Moved to their respective packages
3. **System Commands**: Available as standalone commands

The registry system maintains backward compatibility during the transition.

## 📦 API Reference

### Main Exports

#### Registry Functions

- `discoverManifests(cwd, noCache?)`: Discover plugin manifests
- `discoverManifestsByNamespace(namespace, cwd)`: Discover by namespace
- `findCommand(nameOrPath)`: Find command by name or path
- `registry`: Command registry instance

#### Command Functions

- `registerBuiltinCommands()`: Register built-in commands
- `hello`, `health`, `version`, `diagnose`: System commands

#### Help Generation

- Help generator utilities for global, group, and manifest help

### Types & Interfaces

See detailed API documentation in code comments and registry types.

## 🔧 Configuration

### Configuration Options

No global configuration needed. Commands are discovered automatically.

### Environment Variables

- `KB_LOG_LEVEL`: Logging level (`silent`, `error`, `warn`, `info`, `debug`)

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/cli-api` (`workspace:*`): CLI API
- `@kb-labs/cli-bin` (`workspace:*`): CLI binary
- `@kb-labs/cli-core` (`workspace:*`): CLI core framework
- `@kb-labs/core-bundle` (`workspace:*`): Core bundle
- `@kb-labs/core-config` (`workspace:*`): Core config
- `@kb-labs/core-policy` (`workspace:*`): Core policy
- `@kb-labs/plugin-*` (`workspace:*`): Plugin packages
- `@kb-labs/workflow-*` (`link:`): Workflow packages
- `ajv` (`^8.17.1`): JSON schema validation
- `glob` (`^11.0.0`): File pattern matching
- `ioredis` (`^5.8.2`): Redis client
- `pino` (`^9.4.0`): Structured logging
- `yaml` (`^2.8.0`): YAML parsing
- `zod` (`^4.1.5`): Schema validation
- `execa` (`^8.0.1`): Process execution
- `uuidv7` (`^1.0.0`): UUID generation

### Development Dependencies

- `@kb-labs/devkit` (`link:`): DevKit presets
- `@types/node` (`^24.3.3`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
├── plugin-setup-command.test.ts
├── plugin-setup-rollback.test.ts
├── plugin-setup.e2e.test.ts
├── register.test.ts
└── registry.test.ts

src/registry/__tests__/
├── availability.test.ts
├── discover.test.ts
├── help.test.ts
├── integration.test.ts
├── register.test.ts
└── run.test.ts
```

### Test Coverage

- **Current Coverage**: ~85%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for discovery, O(1) for command lookup
- **Space Complexity**: O(n) where n = number of commands
- **Bottlenecks**: Plugin discovery for large workspaces

### Optimization Strategies

- **Caching**: In-memory caching of discovery results
- **Lazy Loading**: Commands loaded on demand
- **Shadowing**: Workspace packages shadow node_modules

## 🔒 Security

### Security Considerations

- **Input Validation**: All inputs validated
- **Sandbox Execution**: Commands execute in sandbox
- **Permission Checking**: Manifest permissions enforced
- **Path Validation**: Path operations validated

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Discovery Performance**: Large workspaces may be slow
- **Plugin Loading**: Synchronous plugin loading

### Future Improvements

- **Async Discovery**: Parallel plugin discovery
- **Enhanced Caching**: Better caching strategies

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Command Discovery

```typescript
import { discoverManifests } from '@kb-labs/cli-commands';

const manifests = await discoverManifests(process.cwd());
console.log(`Found ${manifests.length} plugins`);
```

### Example 2: Command Execution

```typescript
import { findCommand, registry } from '@kb-labs/cli-commands';

const command = findCommand('my:command');
if (command) {
  await command.run(context, argv, flags);
}
```

### Example 3: Help Generation

```typescript
import { renderGlobalHelp } from '@kb-labs/cli-commands';

const help = renderGlobalHelp(registry);
console.log(help);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs