import type { Command } from '../../types'
import { createCliEngineLogger, formatRunHeader, statusBadge } from './utils'
import { WorkflowEngine } from '@kb-labs/workflow-engine'
import { box } from '@kb-labs/shared-cli-ui'

interface Flags {
  'from-step'?: string
  json?: boolean
  verbose?: boolean
}

export const wfReplay: Command = {
  name: 'replay',
  describe: 'Replay a workflow run from a snapshot',
  category: 'workflows',
  aliases: ['wf:replay'],
  flags: [
    {
      name: 'from-step',
      type: 'string',
      description: 'Start replay from a specific step ID',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output as JSON',
    },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Enable verbose logging',
    },
  ],
  examples: [
    'kb wf replay <runId>',
    'kb wf replay <runId> --from-step step-123',
    'kb wf replay <runId> --json',
  ],
  async run(ctx, argv, rawFlags) {
    if (argv.length === 0 || !argv[0]) {
      ctx.presenter.error('Usage: kb wf replay <runId> [--from-step <stepId>]')
      return 1
    }

    const runId = argv[0]!
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))

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
          ctx.presenter.json({ ok: false, error: message })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      // Replay the run
      const replayedRun = await engine.replayRun(runId, {
        fromStepId: flags['from-step'],
        stepOutputs: snapshot.stepOutputs,
        env: snapshot.env,
      })

      if (!replayedRun) {
        const message = `Failed to replay run ${runId}`
        if (jsonMode) {
          ctx.presenter.json({ ok: false, error: message })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          run: replayedRun,
          fromStepId: flags['from-step'],
        })
      } else {
        const summaryLines: string[] = [
          ...formatRunHeader(replayedRun),
        ]

        if (flags['from-step']) {
          summaryLines.push(`\nReplaying from step: ${flags['from-step']}`)
        }

        for (const job of replayedRun.jobs) {
          summaryLines.push(
            `${statusBadge(job.status)} ${job.jobName} (${job.steps.length} steps)`,
          )
        }

        ctx.presenter.write('\n' + box('Workflow Replay', summaryLines))
        ctx.presenter.success(`✓ Run ${runId} replayed successfully`)
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to replay workflow: ${message}`)
      }
      return 1
    }
  },
}

