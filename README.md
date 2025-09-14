# KB Labs CLI

KB Labs CLI tool for project management and automation. This is part of the **@kb-labs** ecosystem, designed for multi-package repositories using pnpm workspaces.

**Goals:** Fast bootstrap, unified quality rules, simple publishing, and reusable core.

## 📁 Repository Structure

```
apps/
├── demo/                    # Example app / playground
packages/
├── cli/                     # Main CLI package (@kb-labs/cli)
├── adapters/                # Adapters package (@kb-labs/cli-adapters)
├── commands/                # Commands package (@kb-labs/cli-commands)
├── core/                    # Core package (@kb-labs/cli-core)
docs/
└── adr/                     # Architecture Decision Records (ADRs)
```

## 🚀 Quick Start

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev         # Parallel dev mode for selected packages/apps
pnpm build       # Build all packages
pnpm test        # Run tests
pnpm lint        # Lint code
```

### Using the CLI

```bash
# Install globally
npm install -g @kb-labs/cli

# Or use with npx
npx @kb-labs/cli

# Show available commands
kb --help
```

### Creating a New Package

```bash
# Copy and modify existing package structure
cp -r packages/core packages/<new-package-name>
# Then update metadata and imports
```

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development mode for all packages |
| `pnpm build` | Build all packages |
| `pnpm build:clean` | Clean and build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint all code |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm type-check` | TypeScript type checking |
| `pnpm check` | Run lint, type-check, and tests |
| `pnpm ci` | Full CI pipeline (clean, build, check) |
| `pnpm clean` | Clean build artifacts |
| `pnpm clean:all` | Clean all node_modules and build artifacts |

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/cli](./packages/cli/) | Main CLI package with `kb` command |
| [@kb-labs/cli-adapters](./packages/adapters/) | File system, environment, and discovery adapters |
| [@kb-labs/cli-commands](./packages/commands/) | Command implementations |
| [@kb-labs/cli-core](./packages/core/) | Core framework and utilities |

## 📋 Development Policies

- **Code Style:** ESLint + Prettier, TypeScript strict mode
- **Testing:** Vitest with fixtures for integration testing
- **Versioning:** SemVer with automated releases through Changesets
- **Architecture:** Document decisions in ADRs (see `docs/adr/`)

## 🔧 Requirements

- **Node.js:** >= 18.18.0
- **pnpm:** >= 9.0.0

## 📄 License

MIT © KB Labs