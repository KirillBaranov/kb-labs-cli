# @kb-labs/cli

> **KB Labs CLI tool for project management and automation.** Main CLI package providing the `kb` command-line interface as the entry point for the KB Labs CLI ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/cli** is the main CLI package providing the `kb` command-line interface. It serves as the entry point for the KB Labs CLI ecosystem, orchestrating command discovery, execution, argument parsing, logging, and error handling.

### What Problem Does This Solve?

- **CLI Entry Point**: Need unified CLI entry point - cli provides `kb` command
- **Command Orchestration**: Need to orchestrate commands - cli provides orchestration
- **Argument Parsing**: Need argument parsing - cli provides parsing
- **Error Handling**: Need error handling - cli provides error handling
- **Logging Setup**: Need logging setup - cli provides logging

### Why Does This Package Exist?

- **Unified Entry Point**: Single entry point for all CLI functionality
- **Command Orchestration**: Orchestrates command discovery and execution
- **User Experience**: Provides consistent CLI experience
- **Integration**: Integrates all CLI components

### What Makes This Package Unique?

- **Main Entry Point**: Primary CLI entry point
- **Command Orchestration**: Orchestrates all commands
- **Runtime Management**: Manages CLI runtime
- **Middleware Support**: Middleware for timing, limits, etc.

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
- [x] **Testing**: Unit tests, smoke tests present
- [x] **Performance**: Efficient command execution
- [x] **Security**: Input validation
- [x] **Documentation**: API documentation
- [x] **Migration Guide**: N/A (no breaking changes)

## 🏗️ Architecture

### High-Level Architecture

The cli package provides CLI entry point:

```
CLI Entry Point
    │
    ├──► Argument Parsing
    ├──► Command Discovery
    ├──► Command Execution
    ├──► Error Handling
    ├──► Logging Setup
    └──► Runtime Management
```

### Core Components

#### CLI Binary

- **Purpose**: Main entry point (`kb` command)
- **Responsibilities**: Argument parsing, command routing, exit codes
- **Dependencies**: cli-commands, cli-core

#### Runtime Bootstrap

- **Purpose**: Bootstrap CLI runtime
- **Responsibilities**: Initialize runtime, setup middleware, execute commands
- **Dependencies**: cli-commands, cli-core

#### Middleware System

- **Purpose**: Middleware for CLI operations
- **Responsibilities**: Timing, limits, error handling
- **Dependencies**: None

### Design Patterns

- **Entry Point Pattern**: Main CLI entry point
- **Middleware Pattern**: Middleware for operations
- **Orchestrator Pattern**: Command orchestration

### Data Flow

```
CLI Binary (bin.ts)
    │
    ├──► Parse arguments
    ├──► Bootstrap runtime
    ├──► Execute command
    ├──► Handle errors
    └──► Exit with code
```

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g @kb-labs/cli

# Or use with npx
npx @kb-labs/cli
```

### Basic Usage

```bash
# Show help
kb --help

# Run commands
kb <command> [options]
```

## ✨ Features

- **Command-line interface** with `kb` command
- **Project management** and automation tools
- **Extensible command system** via plugins
- **Built on top of** KB Labs CLI core framework
- **Middleware support** for timing, limits
- **Error handling** with proper exit codes
- **Structured logging** with configurable levels

## 📦 API Reference

### Main Exports

#### `run(argv: string[]): Promise<number | void>`

Main CLI execution function.

**Parameters:**
- `argv` (`string[]`): Command-line arguments

**Returns:**
- `Promise<number | void>`: Exit code or void

#### `executeCli(options: CliRuntimeOptions): Promise<number>`

Execute CLI with runtime options.

**Parameters:**
- `options` (`CliRuntimeOptions`): Runtime configuration

**Returns:**
- `Promise<number>`: Exit code

### Types & Interfaces

#### `CliRuntimeOptions`

```typescript
interface CliRuntimeOptions {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  // ... other options
}
```

## 🔧 Configuration

### Configuration Options

No global configuration needed. Options passed via environment variables or command-line flags.

### Environment Variables

- `KB_LOG_LEVEL`: Logging level (`silent`, `error`, `warn`, `info`, `debug`)

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/cli-commands` (`link:`): Command implementations
- `@kb-labs/cli-core` (`workspace:*`): CLI core framework
- `@kb-labs/cli-runtime` (`link:`): CLI runtime
- `@kb-labs/core-cli-adapters` (`link:`): Core CLI adapters
- `@kb-labs/shared-cli-ui` (`link:`): Shared CLI UI
- `@kb-labs/plugin-adapter-cli` (`link:`): Plugin CLI adapter
- `@kb-labs/analytics-sdk-node` (`link:`): Analytics SDK
- `glob` (`^11.0.3`): File pattern matching
- `cli-table3` (`^0.6.5`): Table formatting
- `yaml` (`^2.8.0`): YAML parsing
- `zod` (`^4.1.5`): Schema validation

### Development Dependencies

- `rimraf` (`^6.0.1`): File removal
- `tsup` (`^8.5.0`): TypeScript bundler
- `tsx` (`^4.19.2`): TypeScript execution
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
└── index.test.ts

src/__smoke__/
├── devlink.exit-codes.smoke.spec.ts
├── exit-codes.smoke.spec.ts
├── json-output.smoke.spec.ts
└── json-purity.smoke.spec.ts
```

### Test Coverage

- **Current Coverage**: ~85%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for argument parsing, O(1) for command lookup
- **Space Complexity**: O(n) where n = argument count
- **Bottlenecks**: Command discovery (delegated to cli-commands)

## 🔒 Security

### Security Considerations

- **Input Validation**: All inputs validated
- **Path Validation**: Path operations validated
- **Sandbox Execution**: Commands execute in sandbox (via cli-commands)

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Discovery Performance**: Large workspaces may be slow (delegated to cli-commands)

### Future Improvements

- **Enhanced Error Messages**: Better error messages
- **Performance**: Optimize startup time

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Basic Command Execution

```bash
# Show help
kb --help

# Run command
kb hello

# JSON output
kb hello --json
```

### Example 2: System Commands

```bash
# Health check
kb health

# Diagnose
kb diagnose

# Version
kb version
```

### Example 3: Plugin Commands

```bash
# List plugins
kb plugins list

# Plugin registry
kb plugins registry
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
