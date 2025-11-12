import type { Command } from '../../types'
import { TimingTracker, box } from '@kb-labs/shared-cli-ui'
import { createCliEngineLogger, resolveWorkflowSpec, formatRunHeader, statusBadge } from './utils'
import { runWorkflow } from './service'

interface Flags {
  file?: string
  inline?: string
  stdin?: boolean
  specRef?: string
  idempotency?: string
  'concurrency-group'?: string
  json?: boolean
  verbose?: boolean
}

export const wfRun: Command = {
  name: 'run',
  describe: 'Execute a workflow specification',
  category: 'workflows',
  aliases: ['wf:run'],
  flags: [
    { name: 'file', type: 'string', description: 'Path to workflow specification file' },
    { name: 'inline', type: 'string', description: 'Inline workflow specification (JSON or YAML)' },
    { name: 'stdin', type: 'boolean', description: 'Read workflow spec from STDIN' },
    { name: 'spec-ref', type: 'string', description: 'Specification reference (registry/location)' },
    { name: 'idempotency', type: 'string', description: 'Idempotency key for the workflow run' },
    { name: 'concurrency-group', type: 'string', description: 'Concurrency group identifier' },
    { name: 'json', type: 'boolean', description: 'Output run details as JSON' },
    { name: 'verbose', type: 'boolean', description: 'Enable verbose logging' },
  ],
  examples: [
    'kb wf run --file ./kb.workflow.yml',
    'kb wf run --inline "{\\"name\\":\\"demo\\",\\"on\\":{\\"manual\\":true},\\"jobs\\":{}}"',
    'cat kb.workflow.yml | kb wf run --stdin --idempotency run-123',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
    const tracker = new TimingTracker()

    try {
      const result = await resolveWorkflowSpec(ctx, flags, 'kb.workflow.yml')
      tracker.checkpoint('spec')
      const run = await runWorkflow({
        spec: result.spec,
        idempotencyKey: flags.idempotency,
        concurrencyGroup: flags['concurrency-group'],
        logger,
        metadata: {
          source: result.source,
          invokedFrom: 'cli',
        },
      })
      tracker.checkpoint('run')

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          run,
          timing: tracker.breakdown(),
        })
        return 0
      }

      const summaryLines: string[] = [
        ...formatRunHeader(run, tracker.total()),
      ]

      for (const job of run.jobs) {
        summaryLines.push(
          `${statusBadge(job.status)} ${job.jobName} (${job.steps.length} steps)`,
        )
      }

      ctx.presenter.write('\n' + box('Workflow Run', summaryLines))
      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Workflow run failed: ${message}`)
      }
      return 1
    }
  },
}


