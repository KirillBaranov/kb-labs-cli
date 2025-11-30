import type {
  CreateRedisClientOptions,
  EngineLogger,
  RedisClient,
} from '@kb-labs/workflow-engine'
import {
  WorkflowEngine,
  createRedisClient,
  StateStore,
  createWorkflowWorker,
  type WorkflowWorker,
} from '@kb-labs/workflow-engine'
import type {
  WorkflowRun,
  WorkflowSpec,
} from '@kb-labs/workflow-contracts'
import { RUN_STATES } from '@kb-labs/workflow-constants'
import type {
  WorkflowRunParams,
  WorkflowRunsListOptions,
  WorkflowRunsListResult,
  WorkflowLogStreamOptions,
  WorkflowLogEvent,
  WorkflowWorkerOptions,
  WorkflowEventsListOptions,
  WorkflowEventsListResult,
  WorkflowEventStreamOptions,
  WorkflowEventEnvelope,
} from './types'
import { RedisEventBridge } from '@kb-labs/workflow-engine'
import type { PluginEventEnvelope } from '@kb-labs/plugin-runtime'

const FINAL_RUN_STATUSES = new Set<WorkflowRun['status']>([
  'success',
  'failed',
  'cancelled',
])

const DEFAULT_EVENT_POLL_INTERVAL_MS = 1_000

export class WorkflowService {
  constructor(private readonly logger: EngineLogger) {}

  async runWorkflow(options: WorkflowRunParams): Promise<WorkflowRun> {
    const engine = new WorkflowEngine({
      logger: this.logger,
      redis: this.buildRedisOptions(),
    })

    try {
      const run = await engine.runFromSpec(options.spec, {
        trigger: options.trigger ?? {
          type: 'manual',
          actor: process.env.KB_USER ?? process.env.USER ?? 'cli',
          payload: { source: 'api' },
        },
        idempotencyKey: options.idempotencyKey,
        concurrencyGroup: options.concurrencyGroup,
        metadata: {
          source: options.source ?? 'api',
          ...(options.metadata ?? {}),
        },
      })
      return run
    } finally {
      await engine.dispose()
    }
  }

  async listWorkflowRuns(
    options: WorkflowRunsListOptions = {},
  ): Promise<WorkflowRunsListResult> {
    const redis = createRedisClient({
      ...this.buildRedisOptions(),
      logger: this.logger,
    })

    try {
      const runs = await collectRuns(redis.client, redis.keys.run(''), options)
      return { runs, total: runs.length }
    } finally {
      await closeRedisClient(redis.client)
    }
  }

  async getWorkflowRun(runId: string): Promise<WorkflowRun | null> {
    const redis = createRedisClient({
      ...this.buildRedisOptions(),
      logger: this.logger,
    })
    try {
      const store = new StateStore(redis, this.logger)
      return await store.getRun(runId)
    } finally {
      await closeRedisClient(redis.client)
    }
  }

  async cancelWorkflowRun(runId: string): Promise<WorkflowRun | null> {
    const engine = new WorkflowEngine({
      logger: this.logger,
      redis: this.buildRedisOptions(),
    })

    try {
      const existing = await engine.getRun(runId)
      if (!existing) {
        return null
      }

      if (FINAL_RUN_STATUSES.has(existing.status)) {
        return existing
      }

      const now = new Date().toISOString()
      const updatedJobs = existing.jobs.map((job: WorkflowRun['jobs'][number]): WorkflowRun['jobs'][number] => {
        if (FINAL_RUN_STATUSES.has(job.status)) {
          return job
        }

        const jobStartedAt = job.startedAt ?? job.queuedAt
        const jobDuration =
          jobStartedAt && now ? Date.parse(now) - Date.parse(jobStartedAt) : undefined

        return {
          ...job,
          status: 'cancelled' as const,
          finishedAt: now,
          durationMs: jobDuration && jobDuration > 0 ? jobDuration : job.durationMs,
          steps: job.steps.map((step: WorkflowRun['jobs'][number]['steps'][number]): WorkflowRun['jobs'][number]['steps'][number] => {
            if (FINAL_RUN_STATUSES.has(step.status)) {
              return step
            }
            const stepStartedAt = step.startedAt ?? step.queuedAt
            const stepDuration =
              stepStartedAt && now ? Date.parse(now) - Date.parse(stepStartedAt) : undefined
            return {
              ...step,
              status: 'cancelled' as const,
              finishedAt: now,
              durationMs:
                stepDuration && stepDuration > 0 ? stepDuration : step.durationMs,
            }
          }),
        }
      })

      await engine.finalizeRun(runId, 'cancelled', { jobs: updatedJobs })
      return await engine.getRun(runId)
    } finally {
      await engine.dispose()
    }
  }

  async streamWorkflowLogs(options: WorkflowLogStreamOptions): Promise<void> {
    const redis = createRedisClient({
      ...this.buildRedisOptions(),
      logger: this.logger,
    })

    const channel = redis.keys.eventChannel()
    let stopped = false

    const stop = () => {
      if (!stopped) {
        stopped = true
      }
    }

    const listener = (receivedChannel: string, message: string) => {
      if (receivedChannel !== channel) {
        return
      }
      try {
        const payload = JSON.parse(message) as WorkflowLogEvent
        if (payload.runId !== options.runId) {
          return
        }
        options.onEvent(payload)
      } catch (error) {
        this.logger.warn('Failed to parse workflow event', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    try {
      const client: any = redis.client as any
      client.on('message', listener)
      await client.subscribe(channel)
      this.logger.info('Subscribed to workflow events', { channel })

      if (options.signal) {
        options.signal.addEventListener('abort', stop, { once: true })
      }

      if (options.follow) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (stopped) {
              resolve()
              return
            }
            setTimeout(check, 250)
          }
          check()
        })
      } else {
        const idleMs = options.idleTimeoutMs ?? 3_000
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            stop()
            resolve()
          }, idleMs)
          const poll = () => {
            if (stopped) {
              clearTimeout(timeout)
              resolve()
              return
            }
            setTimeout(poll, 100)
          }
          poll()
        })
      }
    } finally {
      const client: any = redis.client as any
      client.removeListener?.('message', listener)
      try {
        await client.unsubscribe?.(channel)
      } catch {
        // ignore unsubscribe errors
      }
      await closeRedisClient(redis.client)
    }
  }

  async listWorkflowEvents(
    options: WorkflowEventsListOptions,
  ): Promise<WorkflowEventsListResult> {
    const redis = createRedisClient({
      ...this.buildRedisOptions(),
      logger: this.logger,
    })

    try {
      const bridge = new RedisEventBridge({
        client: redis.client,
        keys: redis.keys,
        logger: this.logger,
      })
      const result = await bridge.read(
        options.runId,
        options.cursor ?? null,
        options.limit ?? 200,
      )
      return {
        events: result.events.map(({ event }) => this.toWorkflowEvent(event)),
        cursor: result.cursor,
      }
    } finally {
      await closeRedisClient(redis.client)
    }
  }

  async streamWorkflowEvents(options: WorkflowEventStreamOptions): Promise<void> {
    const redis = createRedisClient({
      ...this.buildRedisOptions(),
      logger: this.logger,
    })

    const bridge = new RedisEventBridge({
      client: redis.client,
      keys: redis.keys,
      logger: this.logger,
    })

    const follow = options.follow ?? true
    const pollInterval = Math.max(options.pollIntervalMs ?? DEFAULT_EVENT_POLL_INTERVAL_MS, 100)
    let cursor: string | null | undefined = options.cursor ?? null
    let active = true

    const abort = () => {
      active = false
    }

    if (options.signal) {
      if (options.signal.aborted) {
        active = false
      } else {
        options.signal.addEventListener('abort', abort, { once: true })
      }
    }

    try {
      while (active) {
        const result = await bridge.read(options.runId, cursor ?? null, 200)
        if (result.events.length > 0) {
          cursor = result.cursor ?? cursor ?? null
          for (const entry of result.events) {
            options.onEvent(this.toWorkflowEvent(entry.event))
          }
        }

        if (!follow) {
          break
        }

        if (!active) {
          break
        }

        await sleep(pollInterval)
      }
    } finally {
      if (options.signal) {
        options.signal.removeEventListener?.('abort', abort as any)
      }
      await closeRedisClient(redis.client)
    }
  }

  private toWorkflowEvent(event: PluginEventEnvelope): WorkflowEventEnvelope {
    const streamId =
      typeof event.meta?.streamId === 'string'
        ? String(event.meta.streamId)
        : undefined

    return {
      id: streamId ?? event.id ?? '',
      type: event.type,
      version: event.version,
      timestamp: event.timestamp ?? new Date().toISOString(),
      payload: event.payload,
      meta: event.meta,
    }
  }

  async createWorker(options: WorkflowWorkerOptions = {}): Promise<WorkflowWorker> {
    const redisOptions = {
      ...this.buildRedisOptions(),
      ...(options.redis ?? {}),
    }

    const worker = await createWorkflowWorker({
      logger: this.logger,
      pollIntervalMs: options.pollIntervalMs,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      leaseTtlMs: options.leaseTtlMs,
      maxConcurrentJobs: options.maxConcurrentJobs,
      redis: redisOptions,
      commandResolverConfig: options.discovery
        ? {
            discovery: {
              strategies: options.discovery.strategies ?? ['workspace', 'pkg'],
              roots: options.discovery.roots,
            },
          }
        : undefined,
      jobHandlerOptions: {
        artifactsRoot: options.artifactsRoot,
        defaultWorkspace: options.defaultWorkspace,
      },
    })

    return worker
  }

  private buildRedisOptions(): CreateRedisClientOptions {
    const modeEnv = process.env.KB_REDIS_MODE
    const namespace = process.env.KB_REDIS_NAMESPACE
    const options: CreateRedisClientOptions = {
      logger: this.logger,
    }
    if (modeEnv) {
      options.mode = modeEnv as CreateRedisClientOptions['mode']
    }
    if (process.env.KB_REDIS_URL) {
      options.url = process.env.KB_REDIS_URL
    }
    if (namespace) {
      options.namespace = namespace
    }
    return options
  }
}

async function collectRuns(
  client: RedisClient,
  runPrefix: string,
  options: WorkflowRunsListOptions,
): Promise<WorkflowRun[]> {
  const limit = options.limit && options.limit > 0 ? options.limit : 50
  const normalizedStatus = normalizeStatusFilter(options.status)
  const matchPattern = `${runPrefix}*`
  let cursor = '0'
  const runs: WorkflowRun[] = []

  do {
    const [nextCursor, keys] = await (client as any).scan(
      cursor,
      'MATCH',
      matchPattern,
      'COUNT',
      200,
    )
    cursor = nextCursor
    if (keys.length > 0) {
      const pipeline = (client as any).multi()
      for (const key of keys) {
        pipeline.get(key)
      }
      const results = await pipeline.exec()
      if (results) {
        for (const entry of results) {
          const data = Array.isArray(entry) ? entry[1] : null
          if (typeof data !== 'string') {
            continue
          }
          try {
            const run = JSON.parse(data) as WorkflowRun
            if (normalizedStatus && run.status !== normalizedStatus) {
              continue
            }
            runs.push(run)
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  } while (cursor !== '0' && runs.length < limit)

  runs.sort((a, b) => {
    const left = Date.parse(b.queuedAt ?? b.createdAt ?? '') || 0
    const right = Date.parse(a.queuedAt ?? a.createdAt ?? '') || 0
    return left - right
  })

  return runs.slice(0, limit)
}

function normalizeStatusFilter(
  status?: string,
): WorkflowRun['status'] | undefined {
  if (!status) {
    return undefined
  }
  const normalized = status.toLowerCase()
  return RUN_STATES.includes(normalized as any)
    ? (normalized as WorkflowRun['status'])
    : undefined
}

async function closeRedisClient(client: RedisClient): Promise<void> {
  if (!client) {
    return
  }
  try {
    if (typeof (client as any).quit === 'function') {
      await (client as any).quit()
      return
    }
    if (typeof (client as any).disconnect === 'function') {
      ;(client as any).disconnect()
    }
  } catch {
    try {
      if (typeof (client as any).disconnect === 'function') {
        ;(client as any).disconnect()
      }
    } catch {
      // ignore
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}



