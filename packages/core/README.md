# @kb-labs/cli-core

> **Core functionality for KB Labs CLI - command framework, context, and utilities.** Provides the core framework and utilities for the KB Labs CLI tool, including command framework, context management, error handling, presentation utilities, plugin system, and discovery mechanisms.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/cli-core** provides the core framework and utilities for KB Labs CLI tool. It includes command framework, context management, error handling, presentation utilities, plugin system, discovery mechanisms, and lifecycle management.

### What Problem Does This Solve?

- **CLI Framework**: CLI tools need command framework - cli-core provides framework
- **Plugin System**: Need plugin support - cli-core provides plugin system
- **Command Discovery**: Need to discover commands - cli-core provides discovery
- **Context Management**: Need execution context - cli-core provides context management
- **Error Handling**: Need structured errors - cli-core provides error handling

### Why Does This Package Exist?

- **Unified CLI Framework**: All KB Labs CLI tools use the same framework
- **Code Reuse**: Avoid duplicating CLI framework code
- **Consistency**: Ensure consistent CLI behavior across tools
- **Extensibility**: Plugin system for extensibility

### What Makes This Package Unique?

- **Comprehensive Framework**: Complete CLI framework with all features
- **Plugin System**: Full plugin support with discovery
- **Discovery Mechanisms**: Multiple discovery strategies
- **Lifecycle Management**: Plugin lifecycle management

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
- [x] **Testing**: Unit tests, integration tests present
- [x] **Performance**: Efficient command execution
- [x] **Security**: Input validation
- [x] **Documentation**: API documentation
- [x] **Migration Guide**: N/A (no breaking changes)

## 🏗️ Architecture

### High-Level Architecture

The cli-core package provides CLI framework:

```
CLI Framework
    │
    ├──► Command Framework (registration, execution)
    ├──► Context Management (execution context)
    ├──► Plugin System (discovery, registration)
    ├──► Discovery (multiple strategies)
    ├──► Lifecycle Management (plugin lifecycle)
    ├──► Error Handling (structured errors)
    └──► Presentation (text, JSON output)
```

### Core Components

#### Command Framework

- **Purpose**: Register and execute commands
- **Responsibilities**: Command registration, flag parsing, execution
- **Dependencies**: Context, presenter

#### Plugin System

- **Purpose**: Support plugin-based architecture
- **Responsibilities**: Plugin discovery, registration, lifecycle
- **Dependencies**: Discovery, lifecycle manager

#### Discovery Manager

- **Purpose**: Discover plugins and commands
- **Responsibilities**: Multiple discovery strategies, dependency resolution
- **Dependencies**: None

### Design Patterns

- **Command Pattern**: Command execution
- **Plugin Pattern**: Plugin-based architecture
- **Strategy Pattern**: Multiple discovery strategies
- **Factory Pattern**: Command and context creation

### Data Flow

```
CLI Entry Point
    │
    ├──► Discovery Manager (discover plugins)
    ├──► Plugin Registry (register plugins)
    ├──► Command Registry (register commands)
    ├──► Parse arguments
    ├──► Execute command
    └──► Present result
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/cli-core
```

### Basic Usage

```typescript
import { Command, Context } from '@kb-labs/cli-core';

class MyCommand extends Command {
  async execute(context: Context) {
    // Command implementation
  }
}
```

## ✨ Features

### Command Framework

- Command registration and execution
- Flag and argument parsing
- Command context management
- Plugin system support

### Context Management

- Execution context
- Configuration management
- Environment handling

### Error Handling

- Structured error types
- Error presentation
- Graceful error handling

### Presentation

- Text and JSON output formatters
- Consistent output formatting
- Progress indicators

### Plugin System

- Plugin discovery (multiple strategies)
- Plugin registration
- Dependency resolution
- Lifecycle management

### Discovery

- Multiple discovery strategies (file, dir, pkg, workspace)
- Dependency resolution
- Path validation

## 📦 API Reference

### Main Exports

#### Command Framework

```typescript
import { CliCommand, CliContext } from '@kb-labs/cli-core';

const command: CliCommand = {
  name: 'my:command',
  description: 'My command',
  run: async (ctx, argv, flags) => {
    // Command implementation
  },
};
```

#### Context

```typescript
import { createContext, CliContext } from '@kb-labs/cli-core';

const ctx = createContext({
  cwd: process.cwd(),
  presenter: new TextPresenter(),
});
```

#### Plugin Registry

```typescript
import { PluginRegistry } from '@kb-labs/cli-core';

const registry = new PluginRegistry();
await registry.discover({ /* options */ });
```

#### Discovery Manager

```typescript
import { DiscoveryManager } from '@kb-labs/cli-core';

const manager = new DiscoveryManager();
const plugins = await manager.discover({ /* options */ });
```

### Types & Interfaces

See detailed API documentation in code comments and public exports.

## 🔧 Configuration

### Configuration Options

No global configuration needed. Options are passed per function/class instantiation.

### Environment Variables

- `KB_LOG_LEVEL`: Logging level for CLI operations

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/shared-cli-ui` (`link:`): CLI UI utilities
- `@kb-labs/plugin-manifest` (`link:`): Plugin manifest system
- `@kb-labs/plugin-adapter-rest` (`link:`): REST adapter
- `colorette` (`^2.0.20`): Colors for terminal
- `semver` (`^7.6.3`): Semantic versioning
- `chokidar` (`^4.0.3`): File watching
- `glob` (`^11.0.0`): File pattern matching
- `yaml` (`^2.8.0`): YAML parsing
- `zod` (`^4.1.5`): Schema validation

### Development Dependencies

- `@types/node` (`^24.3.3`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
├── command.test.ts
├── context-simple.test.ts
├── discovery-manager.test.ts
├── errors.test.ts
├── flags.test.ts
├── plugin-registry.test.ts
└── registry.test.ts
```

### Test Coverage

- **Current Coverage**: ~85%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for discovery, O(1) for command execution
- **Space Complexity**: O(n) where n = number of plugins
- **Bottlenecks**: Plugin discovery for large workspaces

## 🔒 Security

### Security Considerations

- **Input Validation**: All inputs validated
- **Path Validation**: Path operations validated
- **Plugin Security**: Plugin loading with validation

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Discovery Performance**: Large workspaces may be slow
- **Plugin Loading**: Synchronous plugin loading

### Future Improvements

- **Async Plugin Loading**: Parallel plugin loading
- **Discovery Caching**: Cache discovery results

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Command Definition

```typescript
import { CliCommand, CliContext } from '@kb-labs/cli-core';

const command: CliCommand = {
  name: 'hello',
  description: 'Say hello',
  run: async (ctx: CliContext, argv: string[], flags: Record<string, unknown>) => {
    ctx.presenter.write('Hello, world!');
    return 0;
  },
};
```

### Example 2: Plugin Discovery

```typescript
import { DiscoveryManager } from '@kb-labs/cli-core';

const manager = new DiscoveryManager();
const plugins = await manager.discover({
  strategies: ['pkg', 'workspace'],
});
```

### Example 3: Plugin Registry

```typescript
import { PluginRegistry } from '@kb-labs/cli-core';

const registry = new PluginRegistry();
await registry.discover({ /* options */ });
const commands = registry.getCommands();
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
