/**
 * List all workflows (manifest + standalone)
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { box } from '@kb-labs/shared-cli-ui';
import { listWorkflows } from './service';
import type { WorkflowRuntime } from '@kb-labs/workflow-engine';

type WorkflowListResult = CommandResult & {
  workflows?: WorkflowRuntime[];
  total?: number;
};

type WfListFlags = {
  json: { type: 'boolean'; description?: string };
  source: { type: 'string'; description?: string };
  status: { type: 'string'; description?: string };
  tags: { type: 'string'; description?: string };
  search: { type: 'string'; description?: string };
};

export const wfList = defineSystemCommand<WfListFlags, WorkflowListResult>({
  name: 'list',
  category: 'workflows',
  description: 'List all workflows (manifest + standalone)',
  aliases: ['wf:list', 'wf:ls'],
  flags: {
    json: { type: 'boolean', description: 'Output result as JSON' },
    source: { type: 'string', description: 'Filter by source (manifest|standalone)' },
    status: { type: 'string', description: 'Filter by status (active|paused|disabled)' },
    tags: { type: 'string', description: 'Filter by tags (comma-separated)' },
    search: { type: 'string', description: 'Search by name or description' },
  },
  examples: [
    'kb wf list',
    'kb wf list --source=standalone',
    'kb wf list --status=active',
    'kb wf list --tags=deployment,production',
    'kb wf list --search="release"',
    'kb wf list --json',
  ],
  async handler(ctx, _argv, flags) {
    const jsonMode = flags.json;

    try {
      // Parse filters
      const source = flags.source as 'manifest' | 'standalone' | undefined;
      const status = flags.status as 'active' | 'paused' | 'disabled' | undefined;
      const tags = flags.tags ? flags.tags.split(',').map((t: string) => t.trim()) : undefined;

      // List workflows using service
      const filtered = await listWorkflows({
        source,
        status,
        tags,
        search: flags.search,
      });

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          workflows: filtered,
          total: filtered.length,
        });
        return { ok: true, workflows: filtered, total: filtered.length };
      }

      // Format output
      const lines: string[] = [];

      if (filtered.length === 0) {
        lines.push('No workflows found.');
      } else {
        lines.push(`Found ${filtered.length} workflow(s):\n`);

        for (const workflow of filtered) {
          const sourceIcon = workflow.source === 'manifest' ? '📦' : '📄';
          const statusIcon =
            workflow.status === 'active' ? '✅' : workflow.status === 'paused' ? '⏸️' : '⏹️';

          lines.push(`${sourceIcon} ${workflow.name} (${workflow.id})`);
          lines.push(`   Status: ${statusIcon} ${workflow.status}`);
          if (workflow.description) {
            lines.push(`   ${workflow.description}`);
          }
          if (workflow.source === 'manifest' && workflow.pluginId) {
            lines.push(`   From: ${workflow.pluginId}`);
          }
          if (workflow.schedule?.enabled) {
            lines.push(`   Schedule: ${workflow.schedule.cron}`);
          }
          if (workflow.tags && workflow.tags.length > 0) {
            lines.push(`   Tags: ${workflow.tags.join(', ')}`);
          }
          lines.push('');
        }
      }

      ctx.output?.write('\n' + box('Workflows', lines));

      return { ok: true, workflows: filtered, total: filtered.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message });
      } else {
        ctx.output?.error(`Failed to list workflows: ${message}`);
      }
      return { ok: false, error: message };
    }
  },
});
