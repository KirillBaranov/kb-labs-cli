import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit'
import { createCliEngineLogger } from './utils'
import { createRedisClient, ApprovalStepHandler } from '@kb-labs/workflow-engine'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'

type WorkflowApproveResult = CommandResult & {
  action?: 'approved' | 'rejected';
  runId?: string;
  stepId?: string;
  actor?: string;
  approvalStatus?: string;
};

type WfApproveFlags = {
  reject: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfApprove = defineSystemCommand<WfApproveFlags, WorkflowApproveResult>({
  name: 'approve',
  description: 'Approve or reject a pending approval step',
  category: 'workflows',
  aliases: ['wf:approve'],
  flags: {
    reject: { type: 'boolean', description: 'Reject the approval request instead of approving' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf approve <runId> <stepId>',
    'kb wf approve <runId> <stepId> --reject',
    'kb wf approve <runId> <stepId> --json',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    if (argv.length < 2) {
      ctx.output?.error('Usage: kb wf approve <runId> <stepId> [--reject]')
      return { ok: false, error: 'Missing runId or stepId arguments' }
    }

    const runId = argv[0]!
    const stepId = argv[1]!
    const jsonMode = flags.json // Type-safe: boolean
    const reject = flags.reject // Type-safe: boolean
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean

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
          ctx.output?.json({ ok: false, error: message })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message }
      }

      if (request.status !== 'pending') {
        const message = `Approval request is already ${request.status}`
        if (jsonMode) {
          ctx.output?.json({ ok: false, error: message, approvalStatus: request.status })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message, approvalStatus: request.status }
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
          ctx.output?.json({ ok: false, error: message })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message }
      }

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          action: reject ? 'rejected' : 'approved',
          runId,
          stepId,
          actor,
          timestamp: new Date().toISOString(),
        })
      } else {
        ctx.output?.write(`✓ Approval ${reject ? 'rejected' : 'approved'} by ${actor}\n`)
        ctx.output?.write(`Run: ${runId}\n`)
        ctx.output?.write(`Step: ${stepId}\n`)
      }

      return { ok: true, action: reject ? 'rejected' : 'approved', runId, stepId, actor }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to ${reject ? 'reject' : 'approve'} approval: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})

