# @kb-labs/cli-command-kit

Command Kit for KB Labs CLI - utilities and high-level API for building commands.

## Overview

This package provides two levels of API for building CLI commands:

1. **Low-level API**: Atomic utilities for flag validation, analytics, error formatting, etc.
2. **High-level API**: `defineCommand()` wrapper that handles all boilerplate automatically

## Installation

```bash
pnpm add @kb-labs/cli-command-kit
```

## Low-level API

### Flag Validation

```typescript
import { defineFlags, validateFlags } from '@kb-labs/cli-command-kit/flags';

const schema = defineFlags({
  scope: {
    type: 'string',
    required: true,
    pattern: /^[@a-z0-9-/]+$/i,
  },
  'dry-run': {
    type: 'boolean',
    default: false,
    alias: 'n',
  },
  limit: {
    type: 'number',
    min: 1,
    max: 100,
    default: 10,
  },
  format: {
    type: 'string',
    choices: ['json', 'md', 'both'] as const,
    default: 'json',
  },
});

// Type inference
type Flags = typeof schema.infer;

export async function myHandler(
  ctx: CliContext,
  argv: string[],
  rawFlags: Record<string, unknown>
) {
  const flags = await validateFlags(rawFlags, schema);
  // flags is now typed as Flags
}
```

### Analytics Helpers

```typescript
import { trackCommand } from '@kb-labs/cli-command-kit/analytics';

export async function myHandler(ctx: CliContext, argv: string[], rawFlags: Record<string, unknown>) {
  const { emit, scope } = trackCommand(ctx.analytics, {
    command: 'release:run',
    startEvent: 'RELEASE_RUN_STARTED',
    finishEvent: 'RELEASE_RUN_FINISHED',
  });
  
  return await scope(async () => {
    await emit('started', { flags: rawFlags });
    
    // business logic
    
    await emit('finished', { result: 'success' });
  });
}
```

### Error Formatting

```typescript
import { formatError } from '@kb-labs/cli-command-kit/errors';

export async function myHandler(ctx: CliContext, argv: string[], rawFlags: Record<string, unknown>) {
  try {
    // logic
  } catch (error) {
    const formatted = formatError(error, {
      jsonMode: Boolean(rawFlags.json),
      showStack: Boolean(rawFlags.debug),
    });
    
    if (rawFlags.json) {
      ctx.output?.json(formatted.json);
    } else {
      ctx.output?.error(formatted.message);
    }
    
    return 1;
  }
}
```

## High-level API

### defineCommand

The `defineCommand` function provides a complete wrapper that handles:
- Flag validation
- Logging
- Analytics
- Error handling
- Output formatting

```typescript
import { defineCommand } from '@kb-labs/cli-command-kit';
import type { CliContext } from '@kb-labs/cli-core/public';

export const releaseRunHandler = defineCommand({
  name: 'release:run',
  
  flags: {
    scope: {
      type: 'string',
      required: true,
      pattern: /^[@a-z0-9-/]+$/i,
    },
    'dry-run': {
      type: 'boolean',
      default: false,
    },
  },
  
  analytics: {
    startEvent: 'RELEASE_RUN_STARTED',
    finishEvent: 'RELEASE_RUN_FINISHED',
    includeFlags: true,
  },
  
  async handler(ctx, argv, flags) {
    // ctx.tracker is automatically available
    ctx.logger?.info('Release started', { scope: flags.scope });
    ctx.tracker.checkpoint('planning');
    
    const result = await doRelease(flags);
    
    ctx.tracker.checkpoint('complete');
    
    return {
      ok: true,
      published: result.packages,
    };
  },
  
  // Optional: custom formatter
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.output?.json(result);
    } else {
      const lines = [
        `✓ Released ${result.published.length} packages`,
        '',
        ...result.published.map(p => `  - ${p}`),
      ];
      ctx.output?.write(ctx.output.ui.box('Release Complete', lines));
    }
  },
});

// In manifest.v2.ts:
// handler: './cli/commands/run#releaseRunHandler'
```

## Features

- ✅ **Type-safe flags**: Automatic TypeScript type inference from schema
- ✅ **Validation**: Required, default, choices, pattern, min/max, custom validators
- ✅ **Analytics**: Automatic tracking with start/finish events
- ✅ **Logging**: Structured logging with context
- ✅ **Error handling**: Consistent error formatting
- ✅ **Timing**: Built-in TimingTracker
- ✅ **Output**: JSON and human-readable formatting

## API Reference

See [docs/](./docs/) for detailed API documentation.

## License

MIT

