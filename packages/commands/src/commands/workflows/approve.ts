import type { Command } from '../../types'
import { createCliEngineLogger } from './utils'
import { createRedisClient, ApprovalStepHandler } from '@kb-labs/workflow-engine'

interface Flags {
  reject?: boolean
  json?: boolean
  verbose?: boolean
}

export const wfApprove: Command = {
  name: 'approve',
  describe: 'Approve or reject a pending approval step',
  category: 'workflows',
  aliases: ['wf:approve'],
  flags: [
    {
      name: 'reject',
      type: 'boolean',
      description: 'Reject the approval request instead of approving',
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
    'kb wf approve <runId> <stepId>',
    'kb wf approve <runId> <stepId> --reject',
    'kb wf approve <runId> <stepId> --json',
  ],
  async run(ctx, argv, rawFlags) {
    if (argv.length < 2) {
      ctx.presenter.error('Usage: kb wf approve <runId> <stepId> [--reject]')
      return 1
    }

    const runId = argv[0]!
    const stepId = argv[1]!
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const reject = Boolean(flags.reject)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))

    try {
      // Create Redis client
      const { client: redisClient } = createRedisClient({
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
      })

      // Create approval handler
      const approvalHandler = new ApprovalStepHandler({
        redisClient,
        logger,
      })

      // Check if approval request exists
      const request = await approvalHandler.getApprovalRequest(runId, stepId)
      if (!request) {
        const message = `No pending approval request found for run ${runId}, step ${stepId}`
        if (jsonMode) {
          ctx.presenter.json({ ok: false, error: message })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      if (request.status !== 'pending') {
        const message = `Approval request is already ${request.status}`
        if (jsonMode) {
          ctx.presenter.json({ ok: false, error: message, status: request.status })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      // Get actor (user) - use environment variable or default
      const actor = process.env.USER || process.env.USERNAME || 'unknown'

      // Approve or reject
      const success = reject
        ? await approvalHandler.reject(runId, stepId, actor)
        : await approvalHandler.approve(runId, stepId, actor)

      if (!success) {
        const message = `Failed to ${reject ? 'reject' : 'approve'} approval request`
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
          action: reject ? 'rejected' : 'approved',
          runId,
          stepId,
          actor,
          timestamp: new Date().toISOString(),
        })
      } else {
        ctx.presenter.success(
          `✓ Approval ${reject ? 'rejected' : 'approved'} by ${actor}`,
        )
        ctx.presenter.info(`Run: ${runId}`)
        ctx.presenter.info(`Step: ${stepId}`)
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to ${reject ? 'reject' : 'approve'} approval: ${message}`)
      }
      return 1
    }
  },
}

