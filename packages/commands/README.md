# @kb-labs/cli-commands

Command implementations for KB Labs CLI.

## Overview

This package contains the command implementations for the KB Labs CLI tool. It provides various commands for project management, diagnostics, and automation.

## Available Commands

### Diagnose

Diagnostic command for analyzing project health and configuration.

```bash
kb diagnose [options]
```

### Init Profile

Initialize a new profile configuration.

```bash
kb init-profile [options]
```

### Version

Display version information.

```bash
kb version
```

## Features

- Modular command architecture
- Consistent command interface
- Built-in help and documentation
- Extensible command system

## Development

This package is part of the KB Labs CLI monorepo. For development setup, see the main [README](../../README.md).

## Adding New Commands

1. Create a new command directory in `src/`
2. Implement the command following the established patterns
3. Export the command from the main index file
4. Add tests for the new command

## License

MIT © KB Labs
