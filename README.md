# KB Labs CLI (@kb-labs/cli)

> **KB Labs CLI tool for project management and automation.** This is part of the **@kb-labs** ecosystem, designed for multi-package repositories using pnpm workspaces.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs CLI is the UX wrapper over core providing unified CLI commands (kb *). It enables fast bootstrap, unified quality rules, simple publishing, and reusable core across all KB Labs projects. The CLI provides a consistent interface for all KB Labs tools, making it easy for developers to interact with the ecosystem.

The project solves the problem of inconsistent command interfaces across different KB Labs products by providing a unified CLI experience. Developers can use a single `kb` command to access all functionality, from workspace initialization to profile management, configuration inspection, and diagnostics.

This project is part of the **@kb-labs** ecosystem and integrates seamlessly with other KB Labs tools including Core, DevLink, Mind, Release Manager, and all AI-powered products.

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
pnpm install
```

### Development

```bash
# Start development mode for all packages
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

### Using the CLI

#### Global Installation

```bash
# Install globally
npm install -g @kb-labs/cli

# Or use with npx
npx @kb-labs/cli
```

#### Basic Commands

```bash
# Show help
kb --help

# Show version
kb --version

# Run commands
kb hello
kb health
kb version
kb diagnose
kb setup profile

# JSON output
kb hello --json
kb health --json
kb version --json
```

#### Available Commands

| Command | Description | Exit Code |
|---------|-------------|-----------|
| `hello` | Print a friendly greeting | 0 |
| `health` | Show system health snapshot (`kb.health/1`) | 0 |
| `version` | Show CLI version | 0 |
| `diagnose` | Diagnose project health and configuration | 0 |
| `init` | Initialize complete KB Labs workspace | 0/1/2 |
| `init workspace` | Initialize workspace configuration file | 0/1/2 |
| `init profile` | Initialize or link a profile | 0/1 |
| `init policy` | Add policy scaffold to workspace config | 0/1 |
| `init-profile` | (Legacy) Initialize a new profile configuration | 0 |

#### Global Options

| Option | Description |
|--------|-------------|
| `--help` | Show help information |
| `--version` | Show CLI version |
| `--json` | Output in JSON format |

#### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error (unknown command, validation error, etc.) |
| 2 | Conflict or path validation error (use --force to override) |

### Workspace Initialization

The CLI provides powerful workspace initialization commands to configure your project.

#### Quick Setup

```bash
# Quick start with defaults
kb setup --yes

# What gets created:
# - kb-labs.config.yaml (workspace config)
# - .kb/profiles/node-ts-lib/ (local profile scaffold)
# - .kb/ai-review/ai-review.config.json (product config)
# - .kb/lock.json (lockfile with versions)
```

#### Setup Options

```bash
kb setup [options]

Options:
  --yes                      Use defaults without prompts
  --dry-run                  Preview changes without writing files
  --force                    Overwrite existing files
  --format <yaml|json>       Config file format (default: yaml)
  --profile-key <key>        Profile key (default: default)
  --profile-ref <ref>        Profile reference (npm or local path)
  --products <list>          Comma-separated products (default: aiReview)
  --preset <ref>             Org preset to extend
  --policy-bundle <name>     Policy bundle name
  --json                     Output in JSON format
```

#### Examples

```bash
# Initialize with defaults
kb setup --yes

# Initialize with custom profile
kb setup --profile-ref @kb-labs/profile-node-ts@^1.0.0

# Initialize multiple products
kb setup --products aiReview,devlink --yes

# Preview changes without writing
kb setup --dry-run --yes

# JSON format config
kb setup --format json --yes
```

#### What Gets Created

```
workspace/
├── kb-labs.config.yaml          # Workspace configuration
├── .kb/
│   ├── lock.json               # Lockfile with dependencies
│   ├── profiles/
│   │   └── node-ts-lib/
│   │       ├── profile.json    # Profile manifest
│   │       ├── defaults/
│   │       │   └── ai-review.json
│   │       └── artifacts/
│   │           └── ai-review/
│   │               ├── rules.yml
│   │               └── prompts/
│   │                   └── review.md
│   └── ai-review/
│       └── ai-review.config.json
└── .gitignore                   # Updated with KB Labs entries
```

## ✨ Features

- **Unified CLI Interface**: Single `kb` command for all KB Labs functionality
- **Workspace Initialization**: One-command setup with `kb setup --yes`
- **Profile Management**: Initialize, link, and manage profiles easily
- **Configuration Inspection**: View and explain configuration resolution
- **Diagnostics**: Shared `kb.health/1` snapshot via `kb health` and REST `/health`
- **JSON Output**: Machine-readable output for automation and CI/CD
- **Extensible Architecture**: Plugin system for adding custom commands
- **Consistent UX**: Unified output formatting and error handling

## 📁 Repository Structure

```
kb-labs-cli/
├── apps/                    # Example applications
│   └── demo/                # Example app / playground
├── packages/                # Core packages
│   ├── cli/                 # Main CLI package (@kb-labs/cli)
│   ├── adapters/            # Adapters package (@kb-labs/cli-adapters)
│   ├── commands/            # Commands package (@kb-labs/cli-commands)
│   └── core/                # Core package (@kb-labs/cli-core)
├── docs/                    # Documentation
│   ├── guides/              # Comprehensive guides
│   │   ├── cli-style.md     # CLI design principles
│   │   └── command-output.md # Output formatting guide
│   ├── adr/                 # Architecture Decision Records
│   └── README.md            # Documentation overview
└── scripts/                 # Utility scripts
```

### Directory Descriptions

- **`apps/`** - Example applications demonstrating CLI usage and integration patterns
- **`packages/`** - Individual packages with their own package.json, each serving a specific purpose in the CLI architecture
- **`docs/`** - Comprehensive documentation including guides, ADRs, and API references
- **`scripts/`** - Utility scripts for development and maintenance tasks

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/cli](./packages/cli/) | Main CLI package with `kb` command entry point |
| [@kb-labs/cli-adapters](./packages/adapters/) | File system, environment, and discovery adapters |
| [@kb-labs/cli-commands](./packages/commands/) | Command implementations and registry |
| [@kb-labs/cli-core](./packages/core/) | Core framework and utilities for command execution |

### Package Details

**@kb-labs/cli** provides the main CLI entry point:
- Binary executable (`kb` command)
- Command routing and execution
- Help generation
- Version display

**@kb-labs/cli-adapters** provides adapters for external systems:
- File system operations
- Environment variable access
- Package discovery
- Telemetry sinks

**@kb-labs/cli-commands** contains command implementations:
- Built-in commands (init, setup, diagnose, etc.)
- Command registry
- Plugin system for extensibility
- Manifest system for command discovery

**@kb-labs/cli-core** provides the core framework:
- Command base classes
- Context management
- Flag parsing and validation
- Output formatting (text, JSON, markdown)

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development mode for all packages |
| `pnpm build` | Build all packages |
| `pnpm build:commands` | Build commands package |
| `pnpm build:bin` | Build CLI binary |
| `pnpm build:clean` | Clean and build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage reporting |
| `pnpm lint` | Lint all code |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm format` | Format code with Prettier |
| `pnpm type-check` | TypeScript type checking |
| `pnpm check` | Run lint, type-check, and tests |
| `pnpm ci` | Full CI pipeline (clean, build, check) |
| `pnpm clean:all` | Clean all node_modules and build artifacts |
| `pnpm kb` | Run CLI locally during development |

## 📋 Development Policies

- **Code Style**: ESLint + Prettier, TypeScript strict mode
- **Testing**: Vitest with comprehensive test coverage (94.61%+ required)
- **Test Structure**: Organized in `__tests__` directories with unit and integration tests
- **Versioning**: SemVer with automated releases through Changesets
- **Architecture**: Document decisions in ADRs (see `docs/adr/`)
- **CLI Design**: Follow CLI style guide for consistent UX
- **Output Formatting**: Unified output format (text, JSON, markdown)

## 🔧 Requirements

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

## 📚 Documentation

- [Documentation Standard](./docs/DOCUMENTATION.md) - Full documentation guidelines
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [Architecture Decisions](./docs/adr/) - ADRs for this project

**Quick Start:**
- [Command Quick Reference](./docs/COMMAND_QUICK_REFERENCE.md) - Basic patterns
- [Command Registration](./docs/COMMAND_REGISTRATION.md) - Implementation guide

**Comprehensive Guides:**
- [CLI Style Guide](./docs/guides/cli-style.md) - Design principles and conventions
- [Command Output Guide](./docs/guides/command-output.md) - Detailed formatting patterns

**Architecture:**
- [ADR-0005: Unified CLI Output Formatting](./docs/adr/0005-unified-cli-output-formatting.md) - Output standards
- [Architecture Overview](./docs/ARCHITECTURE.md) - System design

**Need help finding something?** → [Documentation Overview](./docs/README.md)

## 🔗 Related Packages

### Dependencies

- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities and infrastructure abstractions
- [@kb-labs/devkit](https://github.com/KirillBaranov/kb-labs-devkit) - Bootstrap and standards
- [@kb-labs/devlink](https://github.com/KirillBaranov/kb-labs-devlink) - Developer linker and ecosystem orchestrator
- [@kb-labs/mind](https://github.com/KirillBaranov/kb-labs-mind) - Headless context layer
- [@kb-labs/release-manager](https://github.com/KirillBaranov/kb-labs-release-manager) - Release orchestration

### Used By

- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) - Web UI
- All KB Labs projects using CLI commands

### Ecosystem

- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

MIT © KB Labs

---

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.**
