import type { Command } from "../../types";
import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';
import { getContextCwd } from "@kb-labs/shared-cli-ui";

export const diagnose: Command = {
  name: "diagnose",
  category: "system",
  describe: "Quick environment & repo diagnosis",
  longDescription: "Performs a quick diagnosis of the current environment and repository state",
  examples: [
    "kb diagnose"
  ],
  async run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      const cwd = getContextCwd(ctx);
      const repoRoot = ctx?.repoRoot ?? cwd;
      const nodeVersion = process.version;
      const platform = `${process.platform} ${process.arch}`;
      
      const totalTime = tracker.total();

      if (jsonMode) {
        ctx.presenter.json({ 
          ok: true, 
          node: nodeVersion,
          platform,
          repoRoot,
          cwd,
          timing: totalTime 
        });
      } else {
        const summary = keyValue({
          'Node Version': nodeVersion,
          'Platform': platform,
          'Repository Root': repoRoot,
          'Current Directory': cwd,
          'Status': safeSymbols.success + ' Environment OK',
        });
        
        const output = box('Environment Diagnosis', [...summary, '', safeColors.dim(`Time: ${formatTiming(totalTime)}`)]);
        ctx.presenter.write(output);
        
        if (ctx?.logger?.info) {
          ctx.logger.info("[diagnose] Environment check completed");
        }
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
