import type { Command } from '../../types'
import { createCliEngineLogger } from './utils'
import { startWorkflowWorker } from './service'
import { box, keyValue } from '@kb-labs/shared-cli-ui'

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
  ],
  examples: [
    'kb wf worker --concurrency 2',
    'kb wf worker --redis-url redis://localhost:6379 --artifacts-root .kb/artifacts',
    'kb wf worker --root ./plugins,../extra-plugins',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))

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

      ctx.presenter.info?.('Workflow worker started. Press Ctrl+C to stop.')

      const signal = await waitForTermination()
      ctx.presenter.info?.(`Received ${signal}. Shutting down workflow worker...`)

      await worker.stop()
      const metrics = worker.getMetrics()
      await worker.dispose()

      ctx.presenter.info?.('Workflow worker stopped.')
      const summaryLines = keyValue({
        'Started At': metrics.startedAt ?? 'n/a',
        'Processed Jobs': String(metrics.processedJobs),
        'Retried Jobs': String(metrics.retriedJobs),
        'Failed Jobs': String(metrics.failedJobs),
        'Aborted Jobs': String(metrics.abortedJobs),
        'Active Jobs': String(metrics.activeJobs),
        'Last Completion': metrics.lastJobCompletedAt ?? 'n/a',
      })
      ctx.presenter.write?.('\n' + box('Worker Summary', summaryLines))
      return 0
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

