# KB Labs CLI (@kb-labs/cli)

> **KB Labs CLI tool for project management and automation.** Unified `kb` command for all KB Labs tools — workspace setup, health checks, diagnostics, and plugin-powered commands.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs CLI is the UX layer over the KB Labs platform providing a unified `kb` command for all ecosystem functionality. It enables workspace initialization, health diagnostics, plugin discovery, and consistent output formatting across all KB Labs tools.

## 🚀 Quick Start

```bash
# From KB Labs monorepo root
pnpm install
pnpm build

# Run CLI locally during development
pnpm kb --help
```

### Basic Commands

```bash
kb --help           # Show help
kb --version        # Show version
kb health           # System health snapshot (kb.health/1)
kb diagnose         # Diagnose project health and configuration
kb setup --yes      # Initialize KB Labs workspace with defaults
kb plugins list     # List discovered plugins
```

### Global Options

| Option | Description |
|--------|-------------|
| `--help` | Show help |
| `--version` | Show CLI version |
| `--json` | Machine-readable JSON output |

### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error (unknown command, validation error) |
| 2 | Conflict or path validation error (use `--force` to override) |

## 📁 Repository Structure

```
kb-labs-cli/
├── packages/
│   ├── cli-bin/         # Binary entry point (@kb-labs/cli-bin)
│   ├── cli-api/         # Plugin registry and discovery API (@kb-labs/cli-api)
│   ├── cli-commands/    # Built-in command implementations (@kb-labs/cli-commands)
│   ├── cli-contracts/   # Shared types and interfaces (@kb-labs/cli-contracts)
│   ├── cli-core/        # Core framework: context, flags, output (@kb-labs/cli-core)
│   └── cli-runtime/     # Plugin execution runtime (@kb-labs/cli-runtime)
└── docs/                # Documentation and guides
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/cli-bin](./packages/cli-bin/) | Binary entry point — `kb` command, arg routing |
| [@kb-labs/cli-api](./packages/cli-api/) | Plugin registry, discovery, Redis-backed multi-instance support |
| [@kb-labs/cli-commands](./packages/cli-commands/) | Built-in commands: `health`, `diagnose`, `setup`, `init`, `plugins` |
| [@kb-labs/cli-contracts](./packages/cli-contracts/) | Shared TypeScript types and interfaces |
| [@kb-labs/cli-core](./packages/cli-core/) | Core framework: context management, flag parsing, output formatting |
| [@kb-labs/cli-runtime](./packages/cli-runtime/) | Plugin execution runtime and sandboxing |

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all code |
| `pnpm type-check` | TypeScript type checking |
| `pnpm kb` | Run CLI locally during development |

## 📋 Requirements

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

## 📚 Documentation

- [Documentation Standard](./docs/DOCUMENTATION.md) — Documentation guidelines
- [Architecture](./docs/ARCHITECTURE.md) — System design
- [Command Quick Reference](./docs/COMMAND_QUICK_REFERENCE.md) — Basic patterns
- [Command Registration](./docs/COMMAND_REGISTRATION.md) — How to add commands
- [Architecture Decisions](./docs/adr/) — ADRs for this project

**Guides:**
- [CLI Style Guide](./docs/guides/CLI-STYLE.md) — Design principles and conventions
- [Command Output Guide](./docs/guides/COMMAND-OUTPUT.md) — Output formatting patterns

## 🔗 Related Packages

**Dependencies:**
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) — Core utilities and platform abstractions
- [@kb-labs/plugin](https://github.com/KirillBaranov/kb-labs-plugin) — Plugin execution infrastructure
- [@kb-labs/shared](https://github.com/KirillBaranov/kb-labs-shared) — Shared utilities and types

**Used By:**
- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) — Web UI
- All KB Labs plugins (register commands via CLI)

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) — Main ecosystem repository

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

KB Public License v1.1 © KB Labs

---

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.**
