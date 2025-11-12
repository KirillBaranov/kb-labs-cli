import type { Command } from '../../types'
import process from 'node:process'
import { createCliEngineLogger } from './utils'
import { streamWorkflowLogs, type WorkflowLogEvent } from './service'
import { safeColors, TimingTracker, box, keyValue } from '@kb-labs/shared-cli-ui'

interface Flags {
  follow?: boolean
  json?: boolean
  verbose?: boolean
}

export const wfLogs: Command = {
  name: 'logs',
  category: 'workflows',
  describe: 'Stream workflow run events and logs',
  aliases: ['wf:logs', 'wf:runs:logs'],
  flags: [
    {
      name: 'follow',
      type: 'boolean',
      description: 'Continue streaming logs until interrupted',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output events as JSON (disabled with --follow)',
    },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Enable verbose logging',
    },
  ],
  examples: [
    'kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F',
    'kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --follow',
    'kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json',
  ],
  async run(ctx, argv, rawFlags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.presenter.error('Usage: kb wf logs <runId> [--follow]')
      return 1
    }
    const runId = argv[0]!
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const follow = Boolean(flags.follow)

    if (jsonMode && follow) {
      ctx.presenter.error('JSON output is not supported with --follow')
      return 1
    }

    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
    const tracker = new TimingTracker()
    const events: WorkflowLogEvent[] = []

    const controller = new AbortController()
    const handleInterrupt = () => {
      controller.abort()
    }
    process.on('SIGINT', handleInterrupt)

    try {
      await streamWorkflowLogs({
        runId,
        follow,
        logger,
        onEvent(event) {
          events.push(event)
          if (jsonMode) {
            return
          }
          ctx.presenter.write?.(formatEvent(event))
        },
        signal: controller.signal,
      })
      tracker.checkpoint('stream')

      if (jsonMode) {
        ctx.presenter.json?.({
          ok: true,
          runId,
          events,
          timingMs: tracker.total(),
        })
        return 0
      }

      if (events.length === 0) {
        ctx.presenter.info('No workflow events received.')
        return 0
      }

      const summaryLines = [
        ...keyValue({
          'Run ID': runId,
          Mode: follow ? 'follow' : 'snapshot',
          Received: String(events.length),
        }),
      ]

      ctx.presenter.write?.('\n' + box('Workflow Log Summary', summaryLines))
      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json?.({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to stream workflow logs: ${message}`)
      }
      return 1
    } finally {
      process.off('SIGINT', handleInterrupt)
    }
  },
}

function formatEvent(event: WorkflowLogEvent): string {
  const timestamp = event.timestamp ?? new Date().toISOString()
  const scopeParts = []
  if (event.jobId) {
    scopeParts.push(`job:${event.jobId}`)
  }
  if (event.stepId) {
    scopeParts.push(`step:${event.stepId}`)
  }
  const scope = scopeParts.length > 0 ? safeColors.muted(`[${scopeParts.join(' ')}]`) : ''

  const typeColor = event.type.includes('failed') || event.type.includes('error')
    ? safeColors.error
    : event.type.includes('started') || event.type.includes('running')
      ? safeColors.warning
      : safeColors.success

  const payload =
    typeof event.payload === 'string'
      ? event.payload
      : event.payload && Object.keys(event.payload).length > 0
        ? JSON.stringify(event.payload)
        : ''

  const parts = [
    safeColors.muted(timestamp),
    typeColor(event.type),
  ]
  if (scope) {
    parts.push(scope)
  }
  if (payload) {
    parts.push(payload)
  }
  return parts.join(' ')
}


