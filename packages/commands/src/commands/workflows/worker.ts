import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit'
import type { StringFlagSchema } from '@kb-labs/cli-command-kit/flags'
import { createCliEngineLogger } from './utils'
import { startWorkflowWorker } from './service'
import { box, keyValue, formatTiming } from '@kb-labs/shared-cli-ui'
import type { EngineLogger } from '@kb-labs/workflow-engine'
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit'

type WorkflowWorkerResult = CommandResult & {
  failedJobs?: number;
};

type WfWorkerFlags = {
  concurrency: { type: 'number'; description?: string };
  'poll-interval': { type: 'number'; description?: string };
  'heartbeat-interval': { type: 'number'; description?: string };
  'lease-ttl': { type: 'number'; description?: string };
  'redis-url': { type: 'string'; description?: string };
  'redis-mode': { type: 'string'; description?: string; choices?: readonly string[] };
  'redis-namespace': { type: 'string'; description?: string };
  root: { type: 'string'; description?: string };
  'artifacts-root': { type: 'string'; description?: string };
  workspace: { type: 'string'; description?: string };
  verbose: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
  quiet: { type: 'boolean'; description?: string };
};

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

export const wfWorker = defineSystemCommand<WfWorkerFlags, WorkflowWorkerResult>({
  name: 'worker',
  description: 'Start a workflow worker that processes jobs from the queue',
  category: 'workflows',
  aliases: ['wf:worker'],
  flags: {
    concurrency: { type: 'number', description: 'Maximum concurrent jobs (default: 1)' },
    'poll-interval': { type: 'number', description: 'Queue polling interval in milliseconds (default: 1000)' },
    'heartbeat-interval': { type: 'number', description: 'Lease heartbeat interval in milliseconds (default: half of lease TTL)' },
    'lease-ttl': { type: 'number', description: 'Lease time-to-live in milliseconds (default: 15000)' },
    'redis-url': { type: 'string', description: 'Redis connection string override' },
    'redis-mode': { 
      type: 'string', 
      description: 'Redis mode (standalone, cluster, sentinel)',
      choices: ['standalone', 'cluster', 'sentinel'] as readonly string[],
    } as Omit<StringFlagSchema, 'name'>,
    'redis-namespace': { type: 'string', description: 'Redis key namespace override' },
    root: { type: 'string', description: 'Plugin discovery root (comma separated)' },
    'artifacts-root': { type: 'string', description: 'Directory to store workflow artifacts' },
    workspace: { type: 'string', description: 'Default workspace directory for step execution' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
    json: { type: 'boolean', description: 'Output events as JSON (useful for CI/logging)' },
    quiet: { type: 'boolean', description: 'Suppress non-error output (useful for CI)' },
  },
  examples: [
    'kb wf worker --concurrency 2',
    'kb wf worker --redis-url redis://localhost:6379 --artifacts-root .kb/artifacts',
    'kb wf worker --root ./plugins,../extra-plugins',
    'kb wf worker --json --quiet  # CI mode: JSON output, minimal logging',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const verbose = flags.verbose // Type-safe: boolean
    const jsonMode = flags.json // Type-safe: boolean
    const quiet = flags.quiet // Type-safe: boolean
    
    // Note: This command uses custom formatting and doesn't use the standard formatter
    // because it's an interactive long-running process with custom JSON output
    const output = ctx.output;
    const ctxLogger = ctx.logger;

    // Create a logger that formats output nicely
    const baseLogger = createCliEngineLogger(ctx, Boolean(verbose))
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
          
          logger?.info('Workflow worker started', {
            workerId,
            pollIntervalMs: pollInterval,
            maxConcurrentJobs: maxJobs,
          });
          
          if (jsonMode) {
            output?.json({
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
              output?.ui.colors.muted('Press Ctrl+C to stop.') ?? 'Press Ctrl+C to stop.',
            ]
            output?.write('\n' + box('Workflow Worker', summaryLines))
          }
        } else if (message.includes('Job processed successfully')) {
          const jobId = (meta as any)?.jobId
          const runId = (meta as any)?.runId
          const processed = (meta as any)?.processedJobs
          const active = (meta as any)?.activeJobs
          
          const jobName = jobId?.split(':')[1] ?? 'unknown'
          const runShort = runId ? `${runId.substring(0, 8)}...` : 'unknown'
          
          logger?.info('Job processed successfully', {
            jobId,
            runId,
            jobName,
            processed,
            active,
          });
          
          if (jsonMode) {
            output?.json({
              type: 'job_completed',
              jobId,
              runId,
              jobName,
              processed,
              active,
            })
          } else {
            output?.write(
              `\n${output?.ui.symbols.success ?? '✓'} ${output?.ui.colors.success(`Job completed: ${jobName}`) ?? `Job completed: ${jobName}`} (run: ${runShort}, processed: ${processed}, active: ${active})\n`
            )
          }
        } else if (message.includes('Job completed with error')) {
          const jobId = (meta as any)?.jobId
          const jobName = jobId?.split(':')[1] ?? 'unknown'
          
          logger?.error('Job completed with error', {
            jobId,
            jobName,
            error: meta,
          });
          
          if (jsonMode) {
            output?.json({
              type: 'job_failed',
              jobId,
              jobName,
              error: meta,
            })
          } else {
            output?.write(
              `\n${output?.ui.symbols.error ?? '✗'} ${output?.ui.colors.error(`Job failed: ${jobName}`) ?? `Job failed: ${jobName}`}\n`
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
        pollIntervalMs: typeof flags['poll-interval'] === 'number' ? flags['poll-interval'] : undefined,
        heartbeatIntervalMs: typeof flags['heartbeat-interval'] === 'number' ? flags['heartbeat-interval'] : undefined,
        leaseTtlMs: typeof flags['lease-ttl'] === 'number' ? flags['lease-ttl'] : undefined,
        artifactsRoot: typeof flags['artifacts-root'] === 'string' ? flags['artifacts-root'] : undefined,
        defaultWorkspace: typeof flags.workspace === 'string' ? flags.workspace : undefined,
        redis: {
          url: typeof flags['redis-url'] === 'string' ? flags['redis-url'] : undefined,
          mode: typeof flags['redis-mode'] === 'string' ? flags['redis-mode'] as any : undefined,
          namespace: typeof flags['redis-namespace'] === 'string' ? flags['redis-namespace'] : undefined,
        },
        discovery: {
          roots: parseRoots(typeof flags.root === 'string' ? flags.root : undefined),
        },
      }

      if (typeof flags.concurrency === 'number') {
        workerOptions.maxConcurrentJobs = flags.concurrency // Type-safe: number
      }

      const worker = await startWorkflowWorker(workerOptions)

      const signal = await waitForTermination()
      
      if (!quiet) {
        logger?.info('Received termination signal', { signal });
        output?.write(
          `\n${output?.ui.symbols.warning ?? '⚠'} ${output?.ui.colors.warn(`Received ${signal}. Shutting down workflow worker...`) ?? `Received ${signal}. Shutting down workflow worker...`}\n`
        )
      }

      await worker.stop()
      const metrics = worker.getMetrics()
      await worker.dispose()

      const duration = metrics.startedAt
        ? Date.now() - new Date(metrics.startedAt).getTime()
        : 0

      logger?.info('Workflow worker stopped', {
        signal,
        metrics,
        durationMs: duration,
      });

      if (jsonMode) {
        output?.json({
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
          `${output?.ui.symbols.success ?? '✓'} ${output?.ui.colors.success('Workflow worker stopped') ?? 'Workflow worker stopped'} · ${output?.ui.colors.muted(formatTiming(duration)) ?? formatTiming(duration)}`,
        ]
        output?.write('\n' + box('Worker Summary', summaryLines))
      }
      
      // Exit with non-zero if there were failed jobs (useful for CI)
      return { ok: metrics.failedJobs === 0, failedJobs: metrics.failedJobs }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger?.error('Failed to start workflow worker', { error: message });
      output?.error(`Failed to start workflow worker: ${message}`)
      return { ok: false, error: message }
    }
  },
})

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

