import type { Command } from "../../types";
import { updateIndexes } from '@kb-labs/mind-indexer';

export const mindUpdate: Command = {
  name: "update",
  category: "mind",
  describe: "Update Mind indexes with delta indexing",
  aliases: ["mind:update"],
  flags: [
    { 
      name: "cwd", 
      type: "string", 
      default: process.cwd(),
      description: "Working directory" 
    },
    { 
      name: "changed", 
      type: "array", 
      description: "Specific files to update (POSIX paths)" 
    },
    { 
      name: "since", 
      type: "string", 
      description: "Git revision or ISO timestamp to diff since" 
    },
    { 
      name: "time-budget", 
      type: "number", 
      default: 800,
      description: "Time budget in milliseconds" 
    },
    { 
      name: "json", 
      type: "boolean", 
      description: "Output in JSON format" 
    }
  ],
  examples: [
    "kb mind update",
    "kb mind update --since HEAD~1",
    "kb mind update --changed src/index.ts --json",
    "kb mind update --time-budget 2000"
  ],

  async run(ctx, argv, flags) {
    const { 
      cwd = process.cwd(), 
      changed, 
      since, 
      timeBudget = 800, 
      json = false 
    } = flags;

    try {
      const result = await updateIndexes({ 
        cwd, 
        changed, 
        since, 
        timeBudgetMs: timeBudget,
        log: (e) => {
          if (e.level === 'error') {
            ctx.presenter.error(`❌ ${e.msg}\n`);
          } else if (e.level === 'warn') {
            ctx.presenter.warn(`⚠️  ${e.msg}\n`);
          }
        }
      });

      if (json) {
        ctx.presenter.json(result);
      } else {
        // Human summary
        ctx.presenter.write("📊 Mind Index Update Summary\n\n");
        
        ctx.presenter.write(`API: ${result.api.added} added, ${result.api.updated} updated, ${result.api.removed} removed\n`);
        
        if (result.deps) {
          ctx.presenter.write(`Deps: ${result.deps.edgesAdded} edges added, ${result.deps.edgesRemoved} edges removed\n`);
        }
        
        if (result.diff) {
          ctx.presenter.write(`Diff: ${result.diff.files} files changed\n`);
        }
        
        ctx.presenter.write(`Time: ${result.budget.usedMs}ms / ${result.budget.limitMs}ms\n`);
        
        if (result.partial) {
          ctx.presenter.warn("⚠️  Operation completed partially (time budget exceeded)\n");
        } else {
          ctx.presenter.success("✅ Index update completed successfully\n");
        }
      }
      
      return 0;
    } catch (error: any) {
      ctx.presenter.error(`❌ Failed to update indexes: ${error.message}\n`);
      if (error.hint) {
        ctx.presenter.error(`   Hint: ${error.hint}\n`);
      }
      return 1;
    }
  }
};
