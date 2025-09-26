# @kb-labs/cli-core

Core functionality for KB Labs CLI - command framework, context, and utilities.

## Overview

This package provides the core framework and utilities for the KB Labs CLI tool. It includes the command framework, context management, error handling, and presentation utilities.

## Features

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

## API

### Command Framework

```typescript
import { Command, Context } from "@kb-labs/cli-core";

class MyCommand extends Command {
  async execute(context: Context) {
    // Command implementation
  }
}
```

### Context

```typescript
import { Context } from "@kb-labs/cli-core";

// Access context in commands
const config = context.config;
const flags = context.flags;
```

### Error Handling

```typescript
import { CLIError } from "@kb-labs/cli-core";

throw new CLIError("Something went wrong");
```

### Presentation

```typescript
import { TextPresenter, JsonPresenter } from "@kb-labs/cli-core";

const presenter = new TextPresenter();
presenter.info("Information message");
```

## Development

This package is part of the KB Labs CLI monorepo. For development setup, see the main [README](../../README.md).

## License

MIT © KB Labs
