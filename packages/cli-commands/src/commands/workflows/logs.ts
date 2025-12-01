import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit'
import process from 'node:process'
import { createCliEngineLogger } from './utils'
import { streamWorkflowLogs, type WorkflowLogEvent } from './service'
import { safeColors, TimingTracker, box, keyValue } from '@kb-labs/shared-cli-ui'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'

type WorkflowLogsResult = CommandResult & {
  runId?: string;
  events?: WorkflowLogEvent[];
};

type WfLogsFlags = {
  follow: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfLogs = defineSystemCommand<WfLogsFlags, WorkflowLogsResult>({
  name: 'logs',
  category: 'workflows',
  description: 'Stream workflow run events and logs',
  aliases: ['wf:logs', 'wf:runs:logs'],
  flags: {
    follow: { type: 'boolean', description: 'Continue streaming logs until interrupted' },
    json: { type: 'boolean', description: 'Output events as JSON (disabled with --follow)' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F',
    'kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --follow',
    'kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.output?.error('Usage: kb wf logs <runId> [--follow]')
      return { ok: false, error: 'Missing runId argument' }
    }
    const runId = argv[0]!
    const jsonMode = flags.json // Type-safe: boolean
    const follow = flags.follow // Type-safe: boolean

    if (jsonMode && follow) {
      ctx.output?.error('JSON output is not supported with --follow')
      return { ok: false, error: 'JSON output is not supported with --follow' }
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
          ctx.output?.write(formatEvent(event))
        },
        signal: controller.signal,
      })
      tracker.checkpoint('stream')

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          runId,
          events,
          timingMs: tracker.total(),
        })
        return { ok: true, runId, events }
      }

      if (events.length === 0) {
        ctx.output?.info('No workflow events received.')
        return { ok: true, events: [] }
      }

      const summaryLines = [
        ...keyValue({
          'Run ID': runId,
          Mode: follow ? 'follow' : 'snapshot',
          Received: String(events.length),
        }),
      ]

      ctx.output?.write('\n' + box('Workflow Log Summary', summaryLines))
      return { ok: true, runId, events }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to stream workflow logs: ${message}`)
      }
      return { ok: false, error: message }
    } finally {
      process.off('SIGINT', handleInterrupt)
    }
  },
})

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


