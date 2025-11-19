import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit'
import { createWorkflowRegistry } from '@kb-labs/workflow-runtime'
import {
  TimingTracker,
  box,
  keyValue,
  safeColors,
  safeSymbols,
  formatTiming,
  bulletList,
} from '@kb-labs/shared-cli-ui'
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit'

function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const group = String(item[key])
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

type WorkflowListResult = CommandResult & {
  workflows?: Array<{ id: string; source: string; tags?: string[] }>;
  total?: number;
};

type WfListFlags = {
  source: { type: 'string'; description?: string; default: 'all' };
  tag: { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const wfList = defineSystemCommand<WfListFlags, WorkflowListResult>({
  name: 'list',
  description: 'List all discovered workflows',
  category: 'workflows',
  aliases: ['wf:list'],
  flags: {
    source: { type: 'string', description: 'Filter by source (workspace|plugin|all)', default: 'all' },
    tag: { type: 'string', description: 'Filter by tag' },
    json: { type: 'boolean', description: 'Output as JSON' },
  },
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const tracker = new TimingTracker()
    const jsonMode = Boolean(flags.json)

    try {
      tracker.checkpoint('start')

      // 1. Create registry
      const registry = await createWorkflowRegistry({
        workspaceRoot: process.cwd(),
      })

      // 2. List workflows
      let workflows = await registry.list()
      tracker.checkpoint('list')

      // 3. Filter
      if (flags.source && flags.source !== 'all') {
        workflows = workflows.filter((w) => w.source === flags.source as string)
      }
      if (flags.tag) {
        workflows = workflows.filter((w) => w.tags?.includes(flags.tag as string))
      }

      // 4. Output
      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          workflows,
          total: workflows.length,
          timingMs: tracker.total(),
        })
        return { ok: true, workflows, total: workflows.length }
      }

      // Human-readable
      if (workflows.length === 0) {
        const summaryLines: string[] = [
          safeColors.muted('No workflows found.'),
          '',
          safeColors.muted('💡 Create workflows in .kb/workflows/ or declare them in plugin manifests.'),
        ]
        ctx.output?.write('\n' + box('Available Workflows', summaryLines))
        return { ok: true, workflows: [], total: 0 }
      }

      const bySource = groupBy(workflows, 'source')
      const summaryLines: string[] = []

      for (const [source, wfs] of Object.entries(bySource)) {
        const sourceLabel = source === 'workspace' ? '📁 Workspace' : '🔌 Plugin'
        summaryLines.push('')
        summaryLines.push(safeColors.bold(sourceLabel))

        for (const wf of wfs) {
          const workflowLine = `${safeSymbols.bullet} ${safeColors.primary(wf.id)}`
          const parts: string[] = [workflowLine]

          if (wf.description) {
            parts.push(safeColors.muted(`- ${wf.description}`))
          }
          if (wf.tags?.length) {
            parts.push(safeColors.muted(`[${wf.tags.join(', ')}]`))
          }

          summaryLines.push('  ' + parts.join(' '))
        }
      }

      summaryLines.push('')
      summaryLines.push(
        ...keyValue({
          Total: String(workflows.length),
          Source: (flags.source as string | undefined) ?? 'all',
        }),
      )
      summaryLines.push('')
      summaryLines.push(
        `${safeSymbols.success} ${safeColors.success('Listed workflows')} · ${safeColors.muted(formatTiming(tracker.total()))}`,
      )

      ctx.output?.write('\n' + box('Available Workflows', summaryLines))
      return { ok: true, workflows, total: workflows.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({
          ok: false,
          error: message,
          timingMs: tracker.total(),
        })
      } else {
        ctx.output?.error(`Failed to list workflows: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})

