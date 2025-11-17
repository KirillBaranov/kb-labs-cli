import type { Command } from '../../types'
import { createCliEngineLogger } from './utils'
import { startWorkflowWorker } from './service'
import { box, keyValue, safeColors, safeSymbols, formatTiming } from '@kb-labs/shared-cli-ui'
import type { EngineLogger } from '@kb-labs/workflow-engine'

interface Flags {
  concurrency?: number
  'poll-interval'?: number
  'heartbeat-interval'?: number
  'lease-ttl'?: number
  'redis-url'?: string
  'redis-mode'?: 'standalone' | 'cluster' | 'sentinel'
  'redis-namespace'?: string
  root?: string
  'artifacts-root'?: string
  workspace?: string
  verbose?: boolean
  json?: boolean
  quiet?: boolean
}

function parseRoots(input?: string): string[] | undefined {
  if (!input) {
    return undefined
  }
  const parts = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : undefined
}

export const wfWorker: Command = {
  name: 'worker',
  describe: 'Start a workflow worker that processes jobs from the queue',
  category: 'workflows',
  aliases: ['wf:worker'],
  flags: [
    { name: 'concurrency', type: 'number', description: 'Maximum concurrent jobs (default: 1)' },
    { name: 'poll-interval', type: 'number', description: 'Queue polling interval in milliseconds (default: 1000)' },
    { name: 'heartbeat-interval', type: 'number', description: 'Lease heartbeat interval in milliseconds (default: half of lease TTL)' },
    { name: 'lease-ttl', type: 'number', description: 'Lease time-to-live in milliseconds (default: 15000)' },
    { name: 'redis-url', type: 'string', description: 'Redis connection string override' },
    { name: 'redis-mode', type: 'string', description: 'Redis mode (standalone, cluster, sentinel)' },
    { name: 'redis-namespace', type: 'string', description: 'Redis key namespace override' },
    { name: 'root', type: 'string', description: 'Plugin discovery root (comma separated)' },
    { name: 'artifacts-root', type: 'string', description: 'Directory to store workflow artifacts' },
    { name: 'workspace', type: 'string', description: 'Default workspace directory for step execution' },
    { name: 'verbose', type: 'boolean', description: 'Enable verbose logging' },
    { name: 'json', type: 'boolean', description: 'Output events as JSON (useful for CI/logging)' },
    { name: 'quiet', type: 'boolean', description: 'Suppress non-error output (useful for CI)' },
  ],
  examples: [
    'kb wf worker --concurrency 2',
    'kb wf worker --redis-url redis://localhost:6379 --artifacts-root .kb/artifacts',
    'kb wf worker --root ./plugins,../extra-plugins',
    'kb wf worker --json --quiet  # CI mode: JSON output, minimal logging',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const verbose = Boolean(flags.verbose)
    const jsonMode = Boolean(flags.json)
    const quiet = Boolean(flags.quiet)

    // Create a logger that formats output nicely
    const baseLogger = createCliEngineLogger(ctx, verbose)
    const events: Array<{ type: string; timestamp: string; data: any }> = []
    
    const logger: EngineLogger = {
      debug(message, meta) {
        if (verbose && !quiet) {
          baseLogger.debug(message, meta)
        }
        if (jsonMode) {
          events.push({
            type: 'debug',
            timestamp: new Date().toISOString(),
            data: { message, meta },
          })
        }
      },
      info(message, meta) {
        if (jsonMode) {
          events.push({
            type: 'info',
            timestamp: new Date().toISOString(),
            data: { message, meta },
          })
        }
        
        if (quiet) {
          return
        }
        
        if (message.includes('Workflow worker started')) {
          const workerId = (meta as any)?.workerId
          const pollInterval = (meta as any)?.pollIntervalMs
          const maxJobs = (meta as any)?.maxConcurrentJobs
          
          if (jsonMode) {
            ctx.presenter.json?.({
              type: 'worker_started',
              workerId,
              pollIntervalMs: pollInterval,
              maxConcurrentJobs: maxJobs,
            })
          } else {
            const summaryLines: string[] = [
              ...keyValue({
                'Worker ID': workerId ? `${workerId.substring(0, 8)}...` : 'n/a',
                'Poll Interval': pollInterval ? `${pollInterval}ms` : '1000ms',
                'Max Concurrent Jobs': String(maxJobs ?? 1),
              }),
              '',
              safeColors.muted('Press Ctrl+C to stop.'),
            ]
            ctx.presenter.write?.('\n' + box('Workflow Worker', summaryLines))
          }
        } else if (message.includes('Job processed successfully')) {
          const jobId = (meta as any)?.jobId
          const runId = (meta as any)?.runId
          const processed = (meta as any)?.processedJobs
          const active = (meta as any)?.activeJobs
          
          const jobName = jobId?.split(':')[1] ?? 'unknown'
          const runShort = runId ? `${runId.substring(0, 8)}...` : 'unknown'
          
          if (jsonMode) {
            ctx.presenter.json?.({
              type: 'job_completed',
              jobId,
              runId,
              jobName,
              processed,
              active,
            })
          } else {
            ctx.presenter.write?.(
              `\n${safeSymbols.success} ${safeColors.success(`Job completed: ${jobName}`)} (run: ${runShort}, processed: ${processed}, active: ${active})\n`
            )
          }
        } else if (message.includes('Job completed with error')) {
          const jobId = (meta as any)?.jobId
          const jobName = jobId?.split(':')[1] ?? 'unknown'
          
          if (jsonMode) {
            ctx.presenter.json?.({
              type: 'job_failed',
              jobId,
              jobName,
              error: meta,
            })
          } else {
            ctx.presenter.write?.(
              `\n${safeSymbols.error} ${safeColors.error(`Job failed: ${jobName}`)}\n`
            )
          }
        } else {
          baseLogger.info(message, meta)
        }
      },
      warn(message, meta) {
        if (jsonMode) {
          events.push({
            type: 'warn',
            timestamp: new Date().toISOString(),
            data: { message, meta },
          })
        }
        if (!quiet) {
          baseLogger.warn(message, meta)
        }
      },
      error(message, meta) {
        if (jsonMode) {
          events.push({
            type: 'error',
            timestamp: new Date().toISOString(),
            data: { message, meta },
          })
        }
        baseLogger.error(message, meta)
      },
    }

    try {
      type StartOptions = Parameters<typeof startWorkflowWorker>[0]
      const workerOptions: StartOptions = {
        logger,
        pollIntervalMs: flags['poll-interval'],
        heartbeatIntervalMs: flags['heartbeat-interval'],
        leaseTtlMs: flags['lease-ttl'],
        artifactsRoot: flags['artifacts-root'],
        defaultWorkspace: flags.workspace,
        redis: {
          url: flags['redis-url'],
          mode: flags['redis-mode'],
          namespace: flags['redis-namespace'],
        },
        discovery: {
          roots: parseRoots(flags.root),
        },
      }

      if (typeof flags.concurrency === 'number') {
        workerOptions.maxConcurrentJobs = flags.concurrency
      }

      const worker = await startWorkflowWorker(workerOptions)

      const signal = await waitForTermination()
      
      if (!quiet) {
        ctx.presenter.write?.(
          `\n${safeSymbols.warning} ${safeColors.warning(`Received ${signal}. Shutting down workflow worker...`)}\n`
        )
      }

      await worker.stop()
      const metrics = worker.getMetrics()
      await worker.dispose()

      const duration = metrics.startedAt
        ? Date.now() - new Date(metrics.startedAt).getTime()
        : 0

      if (jsonMode) {
        ctx.presenter.json?.({
          type: 'worker_stopped',
          signal,
          metrics: {
            startedAt: metrics.startedAt,
            processedJobs: metrics.processedJobs,
            retriedJobs: metrics.retriedJobs,
            failedJobs: metrics.failedJobs,
            abortedJobs: metrics.abortedJobs,
            activeJobs: metrics.activeJobs,
            lastJobCompletedAt: metrics.lastJobCompletedAt,
            durationMs: duration,
          },
          events,
        })
      } else if (!quiet) {
        const summaryLines: string[] = [
          ...keyValue({
            'Started At': metrics.startedAt
              ? new Date(metrics.startedAt).toISOString()
              : 'n/a',
            'Processed Jobs': String(metrics.processedJobs),
            'Retried Jobs': String(metrics.retriedJobs),
            'Failed Jobs': String(metrics.failedJobs),
            'Aborted Jobs': String(metrics.abortedJobs),
            'Active Jobs': String(metrics.activeJobs),
            'Last Completion': metrics.lastJobCompletedAt
              ? new Date(metrics.lastJobCompletedAt).toISOString()
              : 'n/a',
          }),
          '',
          `${safeSymbols.success} ${safeColors.success('Workflow worker stopped')} · ${safeColors.muted(formatTiming(duration))}`,
        ]
        ctx.presenter.write?.('\n' + box('Worker Summary', summaryLines))
      }
      
      // Exit with non-zero if there were failed jobs (useful for CI)
      return metrics.failedJobs > 0 ? 1 : 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.presenter.error?.(`Failed to start workflow worker: ${message}`)
      return 1
    }
  },
}

function waitForTermination(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const handler = (signal: NodeJS.Signals) => {
      cleanup()
      resolve(signal)
    }

    const cleanup = () => {
      process.off('SIGINT', handler)
      process.off('SIGTERM', handler)
    }

    process.on('SIGINT', handler)
    process.on('SIGTERM', handler)
  })
}

