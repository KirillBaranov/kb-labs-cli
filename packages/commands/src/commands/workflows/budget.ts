import type { Command } from '../../types'
import { createCliEngineLogger } from './utils'
import { BudgetTracker, createRedisClient } from '@kb-labs/workflow-engine'
import { loadWorkflowConfig } from '@kb-labs/workflow-runtime'
import { box } from '@kb-labs/shared-cli-ui'

interface Flags {
  runId?: string
  json?: boolean
  verbose?: boolean
}

export const wfBudgetStatus: Command = {
  name: 'budget:status',
  describe: 'Show budget status for a workflow run',
  category: 'workflows',
  aliases: ['wf:budget:status'],
  flags: [
    {
      name: 'runId',
      type: 'string',
      description: 'Run ID to check budget for',
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
    'kb wf budget:status --runId <runId>',
    'kb wf budget:status --runId <runId> --json',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))

    if (!flags.runId) {
      const message = '--runId is required'
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(message)
      }
      return 1
    }

    try {
      const workspaceRoot = ctx.workspaceRoot ?? process.cwd()
      const workflowConfig = await loadWorkflowConfig(workspaceRoot)

      if (!workflowConfig.budget?.enabled) {
        const message = 'Budget tracking is not enabled'
        if (jsonMode) {
          ctx.presenter.json({ ok: false, error: message })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      // Create budget tracker
      const tracker = new BudgetTracker(workflowConfig.budget, logger)
      
      // Get Redis client
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

      const status = await tracker.getBudgetStatus(redisClient, flags.runId)

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          status,
        })
      } else {
        const lines: string[] = [
          `Current Cost: ${status.current.toFixed(4)}`,
          `Period: ${status.period}`,
          `Action: ${status.action}`,
        ]

        if (status.limit) {
          lines.push(`Limit: ${status.limit.toFixed(4)}`)
          lines.push(`Exceeded: ${status.exceeded ? 'Yes' : 'No'}`)
          const remaining = status.limit - status.current
          lines.push(`Remaining: ${remaining > 0 ? remaining.toFixed(4) : '0.0000'}`)
        }

        ctx.presenter.write('\n' + box('Budget Status', lines))
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to get budget status: ${message}`)
      }
      return 1
    }
  },
}

