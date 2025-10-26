import type { Command } from "../../types";
import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';

export const hello: Command = {
  name: "hello",
  category: "system",
  describe: "Print a friendly greeting",
  longDescription: "Prints a simple greeting message for testing CLI functionality",
  examples: [
    "kb hello"
  ],
  async run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      const who = ctx?.user ?? "KB Labs";
      const message = `Hello, ${who}!`;
      const totalTime = tracker.total();

      if (jsonMode) {
        ctx.presenter.json({ 
          ok: true, 
          message, 
          who,
          timing: totalTime 
        });
      } else {
        const summary = keyValue({
          'Message': message,
          'User': who,
          'Status': safeSymbols.success + ' Ready',
        });
        
        const output = box('KB Labs CLI', [...summary, '', safeColors.dim(`Time: ${formatTiming(totalTime)}`)]);
        ctx.presenter.write(output);
      }
      
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage, timing: tracker.total() });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};
