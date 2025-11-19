import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { keyValue } from '@kb-labs/shared-cli-ui';
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit';

type HelloResult = CommandResult & {
  message?: string;
  who?: string;
};

type HelloFlags = {
  json: { type: 'boolean'; description?: string };
};

export const hello = defineSystemCommand<HelloFlags, HelloResult>({
  name: 'hello',
  description: 'Print a friendly greeting',
  longDescription: 'Prints a simple greeting message for testing CLI functionality',
  category: 'system',
  examples: ['kb hello'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'hello',
    startEvent: 'HELLO_STARTED',
    finishEvent: 'HELLO_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const who = (ctx as any)?.user ?? 'KB Labs';
    const message = `Hello, ${who}!`;

    ctx.logger?.info('Hello command executed', { who });

    return { ok: true, message, who };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
    } else {
      const summary = ctx.output?.ui.keyValue({
        Message: result.message ?? '',
        User: result.who ?? '',
        Status: ctx.output.ui.colors.success(`${ctx.output.ui.symbols.success} Ready`),
      }) ?? [];

      const output = ctx.output?.ui.box('KB Labs CLI', summary ?? []);
      ctx.output?.write(output ?? '');
    }
  },
});
