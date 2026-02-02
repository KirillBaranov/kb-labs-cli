import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit'
import { createCliEngineLogger, formatRunHeader, statusBadge } from './utils'
import { WorkflowEngine } from '@kb-labs/workflow-engine'
import { box } from '@kb-labs/shared-cli-ui'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'
import type { WorkflowRun } from '@kb-labs/workflow-contracts'

type WorkflowReplayResult = CommandResult & {
  run?: WorkflowRun;
  fromStepId?: string;
};

type WfReplayFlags = {
  'from-step': { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfReplay = defineSystemCommand<WfReplayFlags, WorkflowReplayResult>({
  name: 'replay',
  description: 'Replay a workflow run from a snapshot',
  category: 'workflows',
  aliases: ['wf:replay'],
  flags: {
    'from-step': { type: 'string', description: 'Start replay from a specific step ID' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf replay <runId>',
    'kb wf replay <runId> --from-step step-123',
    'kb wf replay <runId> --json',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.output?.error('Usage: kb wf replay <runId> [--from-step <stepId>]')
      return { ok: false, error: 'Missing runId argument' }
    }

    const runId = argv[0]!
    const jsonMode = flags.json // Type-safe: boolean
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean

    try {
      // Create engine with Redis
      const engine = new WorkflowEngine({
        redis: {
          logger: {
            debug: (msg: string, meta?: Record<string, unknown>) => logger.debug(msg, meta),
            info: (msg: string, meta?: Record<string, unknown>) => logger.info(msg, meta),
            warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(msg, meta),
            error: (msg: string | Error, meta?: Record<string, unknown>) => {
              if (msg instanceof Error) {
                logger.error(msg.message, meta)
              } else {
                logger.error(msg, meta)
              }
            },
          },
        },
        logger,
      })

      // Check if snapshot exists
      const snapshot = await engine.getSnapshot(runId)
      if (!snapshot) {
        const message = `No snapshot found for run ${runId}. Create a snapshot first.`
        if (jsonMode) {
          ctx.output?.json({ ok: false, error: message })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message }
      }

      // Replay the run
      const replayedRun = await engine.replayRun(runId, {
        fromStepId: flags['from-step'], // Type-safe: string | undefined
        stepOutputs: snapshot.stepOutputs,
        env: snapshot.env,
      })

      if (!replayedRun) {
        const message = `Failed to replay run ${runId}`
        if (jsonMode) {
          ctx.output?.json({ ok: false, error: message })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message }
      }

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          run: replayedRun,
          fromStepId: flags['from-step'], // Type-safe: string | undefined
        })
      } else {
        const summaryLines: string[] = [
          ...formatRunHeader(replayedRun),
        ]

        if (flags['from-step']) {
          summaryLines.push(`\nReplaying from step: ${flags['from-step']}`) // Type-safe: string
        }

        for (const job of replayedRun.jobs) {
          summaryLines.push(
            `${statusBadge(job.status)} ${job.jobName} (${job.steps.length} steps)`,
          )
        }

        ctx.output?.write('\n' + box('Workflow Replay', summaryLines))
        ctx.output?.write(`✓ Run ${runId} replayed successfully\n`)
      }

      return { ok: true, run: replayedRun }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to replay workflow: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})

