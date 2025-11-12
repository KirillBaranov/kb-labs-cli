import type { Command } from '../../types'
import { TimingTracker, box } from '@kb-labs/shared-cli-ui'
import { cancelWorkflowRun } from './service'
import { createCliEngineLogger, formatRunHeader } from './utils'

interface Flags {
  json?: boolean
  verbose?: boolean
}

export const wfCancel: Command = {
  name: 'cancel',
  category: 'workflows',
  describe: 'Cancel an in-flight workflow run',
  aliases: ['wf:cancel'],
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output result as JSON',
    },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Enable verbose logging',
    },
  ],
  examples: [
    'kb wf cancel 01HFYQ7C9X1Y2Z3A4B5C6D7E8F',
    'kb wf cancel 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json',
  ],
  async run(ctx, argv, rawFlags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.presenter.error('Usage: kb wf cancel <runId>')
      return 1
    }

    const runId = argv[0]!
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
    const tracker = new TimingTracker()

    try {
      const run = await cancelWorkflowRun(runId, logger)
      tracker.checkpoint('cancel')

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
          ok: run.status === 'cancelled',
          run,
          timingMs: tracker.total(),
        })
        return run.status === 'cancelled' ? 0 : 2
      }

      const lines = [
        ...formatRunHeader(run, tracker.total()),
      ]

      ctx.presenter.write?.('\n' + box('Workflow Run Cancellation', lines))

      if (run.status === 'cancelled') {
        return 0
      }

      ctx.presenter.warn(`Run is already in terminal state: ${run.status}`)
      return 2
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json?.({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to cancel workflow run: ${message}`)
      }
      return 1
    }
  },
}


