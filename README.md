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

# Show help
kb --help

# Show version
kb --version

# Run commands
kb hello
kb version
kb diagnose
kb setup profile

# JSON output
kb hello --json
kb version --json
```

#### Available Commands

| Command | Description | Exit Code |
|---------|-------------|-----------|
| `hello` | Print a friendly greeting | 0 |
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

### Setup Commands

KB Labs provides workspace setup commands to configure your project.

#### kb setup --yes

Setup a complete KB Labs workspace with one command:

```bash
# Quick start with defaults
kb setup --yes

# What gets created:
# - kb-labs.config.yaml (workspace config)
# - .kb/profiles/node-ts-lib/ (local profile scaffold)
# - .kb/ai-review/ai-review.config.json (product config)
# - .kb/lock.json (lockfile with versions)
```

#### Options

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

#### Sub-commands

```bash
# Initialize only workspace config
kb setup workspace --format yaml --products aiReview

# Initialize only profile
kb setup profile --profile-key default --scaffold-local-profile

# Add policy scaffold
kb setup policy --bundle-name default
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

#### Next Steps

After initialization:

```bash
# Print bundle configuration
kb bundle print --product aiReview

# Validate profile
kb profiles validate

# Check system status
kb diagnose
```

### Creating a New Package

```bash
# Copy and modify existing package structure
cp -r packages/core packages/<new-package-name>
# Then update metadata and imports
```

## 🛠️ Available Scripts

| Script             | Description                                |
| ------------------ | ------------------------------------------ |
| `pnpm dev`         | Start development mode for all packages    |
| `pnpm build`       | Build all packages                         |
| `pnpm build:clean` | Clean and build all packages               |
| `pnpm test`        | Run all tests                              |
| `pnpm test:watch`  | Run tests in watch mode                    |
| `pnpm lint`        | Lint all code                              |
| `pnpm lint:fix`    | Fix linting issues                         |
| `pnpm type-check`  | TypeScript type checking                   |
| `pnpm check`       | Run lint, type-check, and tests            |
| `pnpm ci`          | Full CI pipeline (clean, build, check)     |
| `pnpm clean`       | Clean build artifacts                      |
| `pnpm clean:all`   | Clean all node_modules and build artifacts |

## 📦 Packages

| Package                                       | Description                                      |
| --------------------------------------------- | ------------------------------------------------ |
| [@kb-labs/cli](./packages/cli/)               | Main CLI package with `kb` command               |
| [@kb-labs/cli-adapters](./packages/adapters/) | File system, environment, and discovery adapters |
| [@kb-labs/cli-commands](./packages/commands/) | Command implementations                          |
| [@kb-labs/cli-core](./packages/core/)         | Core framework and utilities                     |

## 📋 Development Policies

- **Code Style:** ESLint + Prettier, TypeScript strict mode
- **Testing:** Vitest with comprehensive test coverage (94.61%+ required)
- **Test Structure:** Organized in `__tests__` directories with unit and integration tests
- **Versioning:** SemVer with automated releases through Changesets
- **Architecture:** Document decisions in ADRs (see `docs/adr/`)

## 🔧 Requirements

- **Node.js:** >= 18.18.0
- **pnpm:** >= 9.0.0

## 📄 License

MIT © KB Labs
