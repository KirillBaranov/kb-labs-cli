# @kb-labs/cli-core

> **Core functionality for KB Labs CLI - command framework, context, and utilities.** Provides the core framework and utilities for the KB Labs CLI tool, including command framework, context management, error handling, presentation utilities, plugin system, and discovery mechanisms.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/cli-core** provides the core framework and utilities for KB Labs CLI tool. It includes command framework, context management, error handling, presentation utilities, plugin system, discovery mechanisms, and lifecycle management.

## 🏗️ Architecture

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

## 🔧 Configuration

### Configuration Options

No global configuration needed. Options are passed per function/class instantiation.

### Environment Variables

- `KB_LOG_LEVEL`: Logging level for CLI operations

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
