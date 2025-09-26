# @kb-labs/cli-adapters

Adapters for KB Labs CLI - file system, environment, and discovery utilities.

## Overview

This package provides adapters and utilities for the KB Labs CLI, including:

- **File System Adapters**: File I/O operations and artifacts management
- **Environment Adapters**: Environment variable and repository context handling
- **Discovery Adapters**: Package discovery and static analysis utilities
- **Telemetry Adapters**: File-based telemetry and logging

## Features

- File system operations with proper error handling
- Environment variable management
- Repository context detection
- Package discovery and analysis
- Telemetry and logging capabilities

## API

### File System

```typescript
import { FileAdapter } from "@kb-labs/cli-adapters";

// File operations
const content = await FileAdapter.read("path/to/file");
await FileAdapter.write("path/to/file", content);
```

### Environment

```typescript
import { EnvAdapter } from "@kb-labs/cli-adapters";

// Environment operations
const env = EnvAdapter.getEnvironment();
const repo = EnvAdapter.getRepository();
```

### Discovery

```typescript
import { PackageDiscovery } from "@kb-labs/cli-adapters";

// Package discovery
const packages = await PackageDiscovery.findPackages();
```

## Development

This package is part of the KB Labs CLI monorepo. For development setup, see the main [README](../../README.md).

## License

MIT © KB Labs
