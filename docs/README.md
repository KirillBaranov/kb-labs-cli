# KB Labs CLI Documentation

This directory contains documentation for the KB Labs CLI project.

## Documentation Files

### Command Registration

- **[COMMAND_REGISTRATION.md](./COMMAND_REGISTRATION.md)** - Complete guide for registering new commands
- **[COMMAND_QUICK_REFERENCE.md](./COMMAND_QUICK_REFERENCE.md)** - Quick reference for command development

### Architecture Decision Records (ADR)

- **[ADR 0001: Architecture and Repository Layout](../docs/adr/0001-architecture-and-reposity-layout.md)** - Project structure and organization
- **[ADR 0002: Plugins and Extensibility](../docs/adr/0002-plugins-and-extensibility.md)** - Plugin system design
- **[ADR 0003: Package and Module Boundaries](../docs/adr/0003-package-and-module-boundaries.md)** - Package organization
- **[ADR 0004: Versioning and Release Policy](../docs/adr/0004-versioning-and-release-policy.md)** - Versioning strategy

## Quick Start

### For Developers

1. **Adding a new command**: See [COMMAND_QUICK_REFERENCE.md](./COMMAND_QUICK_REFERENCE.md)
2. **Understanding the architecture**: Read the ADR documents
3. **Full command development**: Follow [COMMAND_REGISTRATION.md](./COMMAND_REGISTRATION.md)

### For AI Assistants

When working with the KB Labs CLI codebase:

1. **Always follow the new command structure** described in the documentation
2. **Use git-style command groups** (`kb devlink plan` instead of `kb devlink:plan`)
3. **Maintain backward compatibility** with legacy formats
4. **Include proper flag metadata** and examples
5. **Test both text and JSON output modes**

## Command Structure Overview

The CLI uses a git-style command structure:

```
kb <group> <command> [flags]
```

Examples:
- `kb devlink plan` - Plan DevLink operations
- `kb profiles validate` - Validate profile configuration
- `kb hello` - Standalone system command

### Backward Compatibility

Legacy formats are still supported:
- `kb devlink:plan` works the same as `kb devlink plan`
- All existing JSON outputs remain unchanged
- Exit codes and behavior are preserved

## Key Concepts

### Command Types

1. **Standalone Commands**: Direct commands like `kb hello`, `kb version`
2. **Group Commands**: Product-organized commands like `kb devlink plan`

### Registration Methods

1. **Individual Registration**: For standalone commands
2. **Group Registration**: For product command groups

### Help System

- **Group Help**: `kb devlink` shows available subcommands
- **Command Help**: `kb devlink plan --help` shows command details
- **Global Help**: `kb --help` shows all available commands

## Development Workflow

1. **Create command file** in appropriate directory
2. **Define command interface** with metadata
3. **Register command** in registry
4. **Test both formats** (new and legacy)
5. **Update documentation** if needed

## Testing

Always test your commands with:

```bash
# New format
pnpm kb myproduct mysubcommand

# Legacy format
pnpm kb myproduct:mysubcommand

# Help
pnpm kb myproduct --help
pnpm kb myproduct mysubcommand --help

# JSON output
pnpm kb myproduct mysubcommand --json
```

## Contributing

When contributing to the CLI:

1. Follow the established patterns in existing commands
2. Maintain backward compatibility
3. Include comprehensive examples
4. Test both output formats
5. Update documentation as needed

For detailed information, refer to the specific documentation files listed above.
