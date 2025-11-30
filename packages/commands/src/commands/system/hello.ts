import { defineSystemCommand, type CommandOutput } from '@kb-labs/shared-command-kit';
import { generateExamples } from '@kb-labs/plugin-manifest';

type HelloFlags = {
  json: { type: 'boolean'; description?: string };
};

export const hello = defineSystemCommand<HelloFlags, CommandOutput>({
  name: 'hello',
  description: 'Print a friendly greeting',
  longDescription: 'Prints a simple greeting message for testing CLI functionality',
  category: 'info',
  examples: generateExamples('hello', 'kb', [
    { flags: {} },
  ]),
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

    // Use new ctx.success() helper for modern UI
    return ctx.success('Greeting', {
      summary: {
        'Message': message,
        'User': who,
      },
      timing: ctx.tracker.total(),
      json: {
        message,
        who,
        status: 'ready',
      },
    });
  },
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      console.log(JSON.stringify(result.json, null, 2));
    } else {
      console.log(result.human);
    }
  },
});
