import type { Command } from '../../types'
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

interface Flags {
  status?: string
  limit?: number
  json?: boolean
  verbose?: boolean
}

export const wfRunsList: Command = {
  name: 'runs list',
  category: 'workflows',
  describe: 'List recent workflow runs',
  aliases: ['wf:runs:list'],
  flags: [
    {
      name: 'status',
      type: 'string',
      description: 'Filter by status (queued|running|success|failed|cancelled|skipped)',
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum number of runs to return (default 20)',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output results as JSON',
    },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Enable verbose logging',
    },
  ],
  examples: [
    'kb wf runs list',
    'kb wf runs list --status running',
    'kb wf runs list --limit 5 --json',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
    const tracker = new TimingTracker()
    const jsonMode = Boolean(flags.json)

    const limit = typeof flags.limit === 'number' && Number.isFinite(flags.limit)
      ? Math.max(1, Math.floor(flags.limit))
      : 20

    try {
      const result = await listWorkflowRuns({
        status: flags.status,
        limit,
        logger,
      })
      tracker.checkpoint('list')

      if (jsonMode) {
        ctx.presenter.json?.({
          ok: true,
          runs: result.runs,
          total: result.total,
          timingMs: tracker.total(),
        })
        return 0
      }

      if (result.runs.length === 0) {
        ctx.presenter.info('No workflow runs found.')
        return 0
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
          Filter: flags.status ?? 'any',
          Limit: String(limit),
        }),
      ]

      summaryLines.push('')
      summaryLines.push(...tableLines)
      summaryLines.push('')
      summaryLines.push(renderStatusLine('Fetched workflow runs', 'success', tracker.total()))

      ctx.presenter.write?.('\n' + box('Workflow Runs', summaryLines))
      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json?.({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to list workflow runs: ${message}`)
      }
      return 1
    }
  },
}


