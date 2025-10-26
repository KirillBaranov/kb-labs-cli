import type { Command } from "../../types";
import { box, keyValue, formatTiming, TimingTracker } from '@kb-labs/shared-cli-ui';

export const version: Command = {
  name: "version",
  category: "system",
  describe: "Show CLI version",
  longDescription: "Displays the current version of the KB Labs CLI",
  examples: [
    "kb version"
  ],
  run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    const v = ctx?.cliVersion ?? ctx?.env?.CLI_VERSION ?? "0.0.0";
    const version = String(v);
    const nodeVersion = process.version;
    const platform = `${process.platform} ${process.arch}`;

    const totalTime = tracker.total();

    if (jsonMode) {
      return { 
        version, 
        nodeVersion, 
        platform,
        timing: totalTime
      };
    } else {
      const summary = keyValue({
        'Version': version,
        'Node': nodeVersion,
        'Platform': platform,
      });

      const output = box('KB Labs CLI', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
      ctx.presenter.write(output);
      return 0;
    }
  },
};
