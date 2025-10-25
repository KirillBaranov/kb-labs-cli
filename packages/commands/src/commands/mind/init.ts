import type { Command } from "../../types";
import { initMindStructure } from '@kb-labs/mind-indexer';

export const mindInit: Command = {
  name: "init",
  category: "mind",
  describe: "Initialize Mind context layer",
  aliases: ["mind:init"],
  flags: [
    { 
      name: "cwd", 
      type: "string", 
      default: process.cwd(),
      description: "Working directory" 
    }
  ],
  examples: [
    "kb mind init",
    "kb mind init --cwd=/path/to/project"
  ],

  async run(ctx, argv, flags) {
    const { cwd = process.cwd() } = flags;

    try {
      await initMindStructure({ 
        cwd, 
        log: (e) => {
          if (e.level === 'error') {
            ctx.presenter.error(`❌ ${e.msg}\n`);
          } else if (e.level === 'warn') {
            ctx.presenter.warn(`⚠️  ${e.msg}\n`);
          } else {
            ctx.presenter.info(`ℹ️  ${e.msg}\n`);
          }
        }
      });

      ctx.presenter.success("✅ Mind context layer initialized\n");
      ctx.presenter.write("   Created .kb/mind/ directory structure\n");
      ctx.presenter.write("   Initialized empty JSON artifacts\n");
      
      return 0;
    } catch (error: any) {
      ctx.presenter.error(`❌ Failed to initialize Mind structure: ${error.message}\n`);
      if (error.hint) {
        ctx.presenter.error(`   Hint: ${error.hint}\n`);
      }
      return 1;
    }
  }
};
