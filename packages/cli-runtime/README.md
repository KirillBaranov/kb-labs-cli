# @kb-labs/cli-runtime

CLI runtime - command execution, middleware, formatters.

## Vision & Purpose

**@kb-labs/cli-runtime** provides CLI runtime infrastructure for KB Labs CLI. It includes command execution, middleware system, output formatters, runtime context management, and event bridge for plugin events.

### Core Goals

- **Command Execution**: Execute commands with middleware support
- **Middleware System**: Chain middleware for command processing
- **Output Formatters**: Format command output (JSON, YAML, table, markdown)
- **Runtime Context**: Manage CLI runtime context
- **Event Bridge**: Bridge plugin events to stdout

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
CLI Runtime
    │
    ├──► Runtime Creation
    ├──► Middleware System
    ├──► Output Formatters
    ├──► Runtime Context
    └──► Event Bridge
```

### Key Components

1. **Runtime** (`runtime.ts`): Create CLI runtime with middleware and formatters
2. **Middleware** (`middleware/`): Middleware chain management
3. **Formatters** (`formatters/`): Output formatters (JSON, YAML, table, markdown)
4. **Context** (`context/`): Runtime context creation
5. **Events** (`events/`): Event bridge for plugin events

## ✨ Features

- **Command execution** with middleware support
- **Middleware chain** with priority-based ordering
- **Output formatters** (JSON, YAML, table, markdown)
- **Runtime context** management
- **Event bridge** for plugin events
- **Execution limits** (timeouts for lifecycle, middleware, discovery)

## 📦 API Reference

### Main Exports

#### Runtime Functions

- `createCliRuntime(options)`: Create CLI runtime instance
- `createRuntimeContext(options)`: Create runtime context

#### Middleware Functions

- `MiddlewareManager`: Middleware chain manager
- `registerMiddleware(middleware)`: Register middleware

#### Formatter Functions

- `FormattersRegistry`: Formatters registry
- `jsonFormatter`: JSON formatter
- `yamlFormatter`: YAML formatter
- `tableFormatter`: Table formatter
- `markdownFormatter`: Markdown formatter

#### Event Bridge Functions

- `StdoutEventBridge`: Event bridge for stdout

### Types & Interfaces

#### `CliRuntime`

```typescript
interface CliRuntime {
  context: CliContext;
  middleware: MiddlewareManager;
  formatters: FormattersRegistry;
  registerMiddleware(middleware: MiddlewareConfig): void;
  registerFormatter(formatter: OutputFormatter): void;
}
```

#### `RuntimeSetupOptions`

```typescript
interface RuntimeSetupOptions extends RuntimeContextOptions {
  executionLimits?: ExecutionLimits;
  middlewares?: MiddlewareConfig[];
  formatters?: OutputFormatter[];
  context?: CliContext;
}
```

#### `MiddlewareConfig`

```typescript
interface MiddlewareConfig {
  name: string;
  priority: number; // lower = runs earlier
  timeoutMs?: number;
  middleware: CommandMiddleware;
}
```

#### `OutputFormatter`

```typescript
interface OutputFormatter {
  name: 'json' | 'yaml' | 'table' | 'markdown' | string;
  format(data: unknown): string;
}
```

## 🔧 Configuration

### Configuration Options

All configuration via `RuntimeSetupOptions`:

- **executionLimits**: Execution limits (timeouts)
- **middlewares**: Middleware configurations
- **formatters**: Custom formatters
- **context**: Pre-created context (optional)
- **presenter**: Presenter for output
- **logger**: Logger instance
- **env**: Environment variables
- **cwd**: Current working directory
- **repoRoot**: Repository root

### Default Execution Limits

- **lifecycleTimeoutMs**: 30,000ms
- **middlewareTimeoutMs**: 5,000ms
- **discoveryTimeoutMs**: 30,000ms

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/cli-core` (`workspace:*`): CLI core
- `@kb-labs/sandbox` (`link:../../../kb-labs-core/packages/sandbox`): Sandbox package
- `cli-table3` (`^0.6.5`): Table formatting
- `yaml` (`^2.8.0`): YAML parsing
- `colorette` (`^2.0.20`): Color output

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.3.3`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
└── (tests to be added)
```

### Test Coverage

- **Current Coverage**: ~0% (tests to be added)
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for middleware chain, O(1) for formatters
- **Space Complexity**: O(n) where n = number of middlewares
- **Bottlenecks**: Middleware chain execution

## 🔒 Security

### Security Considerations

- **Execution Limits**: Timeout limits for middleware and lifecycle
- **Context Isolation**: Runtime context isolation
- **Event Bridge**: Secure event bridge implementation

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Middleware Timeout**: Basic timeout support
- **Formatter Types**: Fixed formatter types

### Future Improvements

- **Enhanced Middleware**: More middleware features
- **Custom Formatters**: Better custom formatter support

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Create CLI Runtime

```typescript
import { createCliRuntime } from '@kb-labs/cli-runtime';
import { createTextPresenter } from '@kb-labs/cli-core';

const runtime = await createCliRuntime({
  presenter: createTextPresenter(),
  middlewares: [
    {
      name: 'logging',
      priority: 1,
      middleware: async (ctx, next) => {
        console.log('Before command');
        const result = await next();
        console.log('After command');
        return result;
      },
    },
  ],
});
```

### Example 2: Register Custom Formatter

```typescript
import { createCliRuntime } from '@kb-labs/cli-runtime';

const runtime = await createCliRuntime({
  presenter: createTextPresenter(),
  formatters: [
    {
      name: 'csv',
      format(data: unknown): string {
        // CSV formatting logic
        return '';
      },
    },
  ],
});
```

### Example 3: Use Event Bridge

```typescript
import { StdoutEventBridge } from '@kb-labs/cli-runtime';

const bridge = new StdoutEventBridge({
  formatter: (event) => JSON.stringify(event, null, 2),
});

await bridge.emit({
  topic: 'plugin.event',
  payload: { data: 'test' },
  ts: Date.now(),
});
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

