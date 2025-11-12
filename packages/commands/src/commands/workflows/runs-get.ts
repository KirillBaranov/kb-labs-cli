import type { Command } from '../../types'
import { TimingTracker, box, formatTable, type TableColumn, safeColors } from '@kb-labs/shared-cli-ui'
import type { JobRun, StepRun } from '@kb-labs/workflow-contracts'
import { createCliEngineLogger, statusBadge, formatRunHeader } from './utils'
import { getWorkflowRun } from './service'

interface Flags {
  json?: boolean
  verbose?: boolean
}

export const wfRunsGet: Command = {
  name: 'runs get',
  category: 'workflows',
  describe: 'Show details for a workflow run',
  aliases: ['wf:runs:get'],
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output run details as JSON',
    },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Enable verbose logging',
    },
  ],
  examples: [
    'kb wf runs get 01HFYQ7C9X1Y2Z3A4B5C6D7E8F',
    'kb wf runs get 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json',
  ],
  async run(ctx, argv, rawFlags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.presenter.error('Usage: kb wf runs get <runId>')
      return 1
    }

    const runId = argv[0]!
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
    const tracker = new TimingTracker()

    try {
      const run = await getWorkflowRun(runId, logger)
      tracker.checkpoint('lookup')

      if (!run) {
        if (jsonMode) {
          ctx.presenter.json?.({ ok: false, error: 'Run not found', runId })
        } else {
          ctx.presenter.error(`Workflow run not found: ${runId}`)
        }
        return 1
      }

      if (jsonMode) {
        ctx.presenter.json?.({
          ok: true,
          run,
          timingMs: tracker.total(),
        })
        return 0
      }

      const headerLines = formatRunHeader(run, tracker.total())

      const jobColumns: TableColumn[] = [
        { header: 'Job' },
        { header: 'Status' },
        { header: 'Runner' },
        { header: 'Steps', align: 'right' },
        { header: 'Started' },
        { header: 'Finished' },
      ]

      const jobRows = run.jobs.map((job: JobRun): string[] => [
        job.jobName,
        statusBadge(job.status),
        job.runsOn,
        `${job.steps.filter((step) => step.status === 'success').length}/${job.steps.length}`,
        job.startedAt ?? '-',
        job.finishedAt ?? '-',
      ])

      const jobTable = formatTable(jobColumns, jobRows, { separator: '─', padding: 2 })

      const stepLines: string[] = []
      for (const job of run.jobs as JobRun[]) {
        if (job.steps.length === 0) {
          continue
        }
        stepLines.push(safeColors.bold(job.jobName))
        for (const step of job.steps as StepRun[]) {
          stepLines.push(`  ${statusBadge(step.status)} ${step.name}`)
        }
        stepLines.push('')
      }
      if (stepLines.length > 0) {
        stepLines.pop()
      }

      const lines: string[] = [
        ...headerLines,
        '',
        ...jobTable,
      ]

      if (stepLines.length > 0) {
        lines.push('', safeColors.bold('Steps'), '')
        lines.push(...stepLines)
      }

      ctx.presenter.write?.('\n' + box('Workflow Run Details', lines))
      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json?.({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to load workflow run: ${message}`)
      }
      return 1
    }
  },
}


