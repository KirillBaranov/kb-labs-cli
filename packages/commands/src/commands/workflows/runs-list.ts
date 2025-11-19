import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit'
import {
  TimingTracker,
  formatTable,
  type TableColumn,
  box,
  keyValue,
} from '@kb-labs/shared-cli-ui'
import { createCliEngineLogger, renderStatusLine, statusBadge } from './utils'
import { listWorkflowRuns } from './service'
import type { WorkflowRun } from '@kb-labs/workflow-contracts'
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit'

type WorkflowRunsListResult = CommandResult & {
  runs?: WorkflowRun[];
  total?: number;
};

type WfRunsListFlags = {
  status: { type: 'string'; description?: string };
  limit: { type: 'number'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfRunsList = defineSystemCommand<WfRunsListFlags, WorkflowRunsListResult>({
  name: 'runs list',
  category: 'workflows',
  description: 'List recent workflow runs',
  aliases: ['wf:runs:list'],
  flags: {
    status: { type: 'string', description: 'Filter by status (queued|running|success|failed|cancelled|skipped)' },
    limit: { type: 'number', description: 'Maximum number of runs to return (default 20)' },
    json: { type: 'boolean', description: 'Output results as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf runs list',
    'kb wf runs list --status running',
    'kb wf runs list --limit 5 --json',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean
    const tracker = new TimingTracker()
    const jsonMode = flags.json // Type-safe: boolean

    const limit = typeof flags.limit === 'number' && Number.isFinite(flags.limit)
      ? Math.max(1, Math.floor(flags.limit))
      : 20

    try {
      const result = await listWorkflowRuns({
        status: flags.status, // Type-safe: string | undefined
        limit,
        logger,
      })
      tracker.checkpoint('list')

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          runs: result.runs,
          total: result.total,
          timingMs: tracker.total(),
        })
        return { ok: true, runs: result.runs, total: result.total }
      }

      if (result.runs.length === 0) {
        ctx.output?.info('No workflow runs found.')
        return { ok: true, runs: [], total: 0 }
      }

      const runColumns: TableColumn[] = [
        { header: 'Run ID' },
        { header: 'Workflow' },
        { header: 'Status' },
        { header: 'Jobs', align: 'right' },
        { header: 'Created' },
        { header: 'Trigger' },
      ]

      const runRows = result.runs.map((run: WorkflowRun): string[] => [
        run.id,
        `${run.name}@${run.version}`,
        statusBadge(run.status),
        `${run.jobs.length}`,
        run.createdAt ?? run.queuedAt ?? '-',
        run.trigger.type,
      ])

      const tableLines = formatTable(runColumns, runRows, {
        separator: '─',
        padding: 2,
      })

      const summaryLines: string[] = [
        ...keyValue({
          Total: String(result.total),
          Filter: flags.status ?? 'any', // Type-safe: string | undefined
          Limit: String(limit),
        }),
      ]

      summaryLines.push('')
      summaryLines.push(...tableLines)
      summaryLines.push('')
      summaryLines.push(renderStatusLine('Fetched workflow runs', 'success', tracker.total()))

      ctx.output?.write('\n' + box('Workflow Runs', summaryLines))
      return { ok: true, runs: result.runs, total: result.total }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to list workflow runs: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})


