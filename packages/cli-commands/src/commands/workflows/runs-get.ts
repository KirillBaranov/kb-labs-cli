import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit'
import { TimingTracker, box, formatTable, type TableColumn, safeColors } from '@kb-labs/shared-cli-ui'
import type { JobRun, StepRun, WorkflowRun } from '@kb-labs/workflow-contracts'
import { createCliEngineLogger, statusBadge, formatRunHeader } from './utils'
import { getWorkflowRun } from './service'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'

type WorkflowRunsGetResult = CommandResult & {
  run?: WorkflowRun;
};

type WfRunsGetFlags = {
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfRunsGet = defineSystemCommand<WfRunsGetFlags, WorkflowRunsGetResult>({
  name: 'runs get',
  category: 'workflows',
  description: 'Show details for a workflow run',
  aliases: ['wf:runs:get'],
  flags: {
    json: { type: 'boolean', description: 'Output run details as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf runs get 01HFYQ7C9X1Y2Z3A4B5C6D7E8F',
    'kb wf runs get 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.output?.error('Usage: kb wf runs get <runId>')
      return { ok: false, error: 'Missing runId argument' }
    }

    const runId = argv[0]!
    const jsonMode = flags.json // Type-safe: boolean
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean
    const tracker = new TimingTracker()

    try {
      const run = await getWorkflowRun(runId, logger)
      tracker.checkpoint('lookup')

      if (!run) {
        if (jsonMode) {
          ctx.output?.json({ ok: false, error: 'Run not found', runId })
        } else {
          ctx.output?.error(`Workflow run not found: ${runId}`)
        }
        return { ok: false, error: 'Run not found', runId }
      }

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          run,
          timingMs: tracker.total(),
        })
        return { ok: true, run }
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

      ctx.output?.write('\n' + box('Workflow Run Details', lines))
      return { ok: true, run }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to load workflow run: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})


