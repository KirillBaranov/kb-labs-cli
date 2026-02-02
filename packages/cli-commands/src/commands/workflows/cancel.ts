import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit'
import { TimingTracker, box } from '@kb-labs/shared-cli-ui'
import { cancelWorkflowRun } from './service'
import { createCliEngineLogger, formatRunHeader } from './utils'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'
import type { WorkflowRun } from '@kb-labs/workflow-contracts'

type WorkflowCancelResult = CommandResult & {
  run?: WorkflowRun;
  warning?: string;
};

type WfCancelFlags = {
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfCancel = defineSystemCommand<WfCancelFlags, WorkflowCancelResult>({
  name: 'cancel',
  category: 'workflows',
  description: 'Cancel an in-flight workflow run',
  aliases: ['wf:cancel'],
  flags: {
    json: { type: 'boolean', description: 'Output result as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf cancel 01HFYQ7C9X1Y2Z3A4B5C6D7E8F',
    'kb wf cancel 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.output?.error('Usage: kb wf cancel <runId>')
      return { ok: false, error: 'Missing runId argument' }
    }

    const runId = argv[0]!
    const jsonMode = flags.json // Type-safe: boolean
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean
    const tracker = new TimingTracker()

    try {
      const run = await cancelWorkflowRun(runId, logger)
      tracker.checkpoint('cancel')

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
          ok: run.status === 'cancelled',
          run,
          timingMs: tracker.total(),
        })
        return { ok: run.status === 'cancelled', run }
      }

      const lines = [
        ...formatRunHeader(run, tracker.total()),
      ]

      ctx.output?.write('\n' + box('Workflow Run Cancellation', lines))

      if (run.status === 'cancelled') {
        return { ok: true, run }
      }

      ctx.output?.warn(`Run is already in terminal state: ${run.status}`)
      return { ok: false, run, warning: `Run is already in terminal state: ${run.status}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to cancel workflow run: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})


