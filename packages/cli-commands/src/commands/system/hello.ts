import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples.js';

type HelloFlags = {
  json: { type: 'boolean'; description?: string };
};

type HelloResult = CommandResult & {
  message: string;
  who: string;
};

export const hello = defineSystemCommand<HelloFlags, HelloResult>({
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

    ctx.platform?.logger?.info('Hello command executed', { who });

    // Output via ctx.ui (pure PluginContextV3)
    if (!flags.json) {
      ctx.ui?.write(`${message}\n`);
    } else {
      ctx.ui?.json({
        message,
        who,
        status: 'ready',
      });
    }

    return {
      ok: true,
      message,
      who,
    };
  },
});
