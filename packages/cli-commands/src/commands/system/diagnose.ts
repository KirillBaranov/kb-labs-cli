import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { generateExamples } from '@kb-labs/plugin-manifest';

type DiagnoseFlags = {
  json: { type: 'boolean'; description?: string };
};

type DiagnoseResult = CommandResult & {
  node?: string;
  platform?: string;
  repoRoot?: string;
  cwd?: string;
};

export const diagnose = defineSystemCommand<DiagnoseFlags, DiagnoseResult>({
  name: 'diagnose',
  description: 'Quick environment & repo diagnosis',
  longDescription: 'Performs a quick diagnosis of the current environment and repository state',
  category: 'info',
  examples: generateExamples('diagnose', 'kb', [
    { flags: {} },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'diagnose',
    startEvent: 'DIAGNOSE_STARTED',
    finishEvent: 'DIAGNOSE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    const repoRoot = (ctx as any)?.repoRoot ?? cwd;
    const nodeVersion = process.version;
    const platform = `${process.platform} ${process.arch}`;

    ctx.logger?.info('Diagnose command executed', { nodeVersion, platform, repoRoot, cwd });

    // Return typed data
    return {
      ok: true,
      node: nodeVersion,
      platform,
      repoRoot,
      cwd,
    };
  },
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Use new ctx.output.ui.sideBox() for modern UI
      const output = ctx.output.ui.sideBox({
        title: 'Environment Diagnosis',
        sections: [
          {
            header: 'Environment',
            items: [
              `Node Version: ${result.node}`,
              `Platform: ${result.platform}`,
              `Repository Root: ${result.repoRoot}`,
              `Current Directory: ${result.cwd}`,
            ],
          },
        ],
        status: 'success',
        timing: ctx.tracker.total(),
      });
      console.log(output);
    }
  },
});
