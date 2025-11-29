/**
 * worker command - Run background job worker daemon
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import type { StringFlagSchema, NumberFlagSchema } from '@kb-labs/cli-command-kit/flags';
import {
  createWorkflowWorker,
  createRedisClient,
  CronScheduler,
  LeaderElection,
} from '@kb-labs/workflow-engine';
import type { CreateRedisClientOptions } from '@kb-labs/workflow-engine';
import { DegradationController } from '@kb-labs/plugin-runtime';
import { PluginRegistry } from '@kb-labs/cli-core';
import { loadPluginJobs } from '../jobs/loader.js';
import { randomUUID } from 'node:crypto';

type WorkerRole = 'all' | 'job-worker' | 'cron-worker' | 'auto';

type WorkerCommandResult = CommandResult & {
  workerId?: string;
  role?: WorkerRole;
  status?: string;
};

type WorkerCommandFlags = {
  role: { type: 'string'; description?: string; default?: string; choices?: readonly string[] };
  'max-concurrent-jobs': { type: 'number'; description?: string; default?: number };
  'poll-interval-ms': { type: 'number'; description?: string; default?: number };
};

export const worker = defineSystemCommand<WorkerCommandFlags, WorkerCommandResult>({
  name: 'worker',
  description: 'Run background job worker daemon',
  category: 'system',
  examples: [
    'kb worker start',
    'kb worker start --role job-worker',
    'kb worker start --role cron-worker',
    'kb worker start --role auto',
    'kb worker start --max-concurrent-jobs 5',
  ],
  flags: {
    role: {
      type: 'string',
      description: 'Worker role: all (default), job-worker, cron-worker, auto',
      default: 'all',
      choices: ['all', 'job-worker', 'cron-worker', 'auto'],
    } as Omit<StringFlagSchema, 'name'>,
    'max-concurrent-jobs': {
      type: 'number',
      description: 'Maximum concurrent jobs',
      default: 1,
    } as Omit<NumberFlagSchema, 'name'>,
    'poll-interval-ms': {
      type: 'number',
      description: 'Job poll interval in milliseconds',
      default: 1000,
    } as Omit<NumberFlagSchema, 'name'>,
  },
  analytics: {
    command: 'worker',
    startEvent: 'WORKER_STARTED',
    finishEvent: 'WORKER_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0 || argv[0] !== 'start') {
      throw new Error('Usage: kb worker start [options]');
    }

    const role = String(flags.role ?? 'all') as WorkerRole;
    const maxConcurrentJobs = Number(flags['max-concurrent-jobs'] ?? 1);
    const pollIntervalMs = Number(flags['poll-interval-ms'] ?? 1000);

    const workerId = `worker-${randomUUID().slice(0, 8)}`;

    ctx.logger?.info('Starting worker', {
      workerId,
      role,
      maxConcurrentJobs,
      pollIntervalMs,
    });

    // Build Redis options
    const redisOptions: CreateRedisClientOptions = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    };

    // Create Redis client
    const redis = await createRedisClient(redisOptions);

    ctx.logger?.info('Connected to Redis', { url: redisOptions.url });

    // Determine actual role based on auto-detection
    let actualRole = role;
    if (role === 'auto') {
      // Auto mode: if Redis is available, use 'all', else in-memory (not implemented yet)
      actualRole = 'all';
      ctx.logger?.info('Auto-detected role', { actualRole });
    }

    let cronScheduler: CronScheduler | undefined;
    let leaderElection: LeaderElection | undefined;
    let degradationController: DegradationController | undefined;

    // Create components based on role
    if (actualRole === 'all' || actualRole === 'cron-worker') {
      // Create leader election
      leaderElection = new LeaderElection(redis, workerId, {
        leaseTTL: 10000, // 10 seconds
        heartbeatInterval: 5000, // 5 seconds
        leaderKey: 'kb:cron:leader',
      });

      await leaderElection.start();
      ctx.logger?.info('Leader election started', { workerId });

      // Create cron scheduler with leader election
      cronScheduler = new CronScheduler(redis, {
        tickIntervalMs: 5000, // 5 seconds
        lookAheadMs: 10000, // 10 seconds
      }, leaderElection);

      cronScheduler.start();
      ctx.logger?.info('Cron scheduler started', { workerId });

      // Load jobs from plugin manifests
      ctx.logger?.info('Loading plugin jobs from manifests', { workerId });

      try {
        // Discover all plugins
        const pluginRegistry = new PluginRegistry({
          strategies: ['workspace', 'pkg'],
        });
        await pluginRegistry.refresh();
        const plugins = pluginRegistry.list();

        // Convert to format expected by loader
        const pluginInfos = plugins.map(plugin => ({
          id: plugin.id,
          kind: plugin.kind,
          manifest: plugin.kind === 'v2' ? pluginRegistry.getManifestV2(plugin.id) : undefined,
        }));

        // Load and register jobs
        await loadPluginJobs({
          cronScheduler,
          plugins: pluginInfos,
          logger: ctx.logger,
        });

        ctx.logger?.info('Plugin jobs loaded successfully', {
          workerId,
          pluginCount: plugins.length,
        });
      } catch (error) {
        ctx.logger?.error('Failed to load plugin jobs', {
          workerId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue even if job loading fails - don't block worker startup
      }
    }

    if (actualRole === 'all') {
      // Create degradation controller
      degradationController = new DegradationController({
        checkIntervalMs: 10000, // 10 seconds
        thresholds: {
          cpu: { warning: 0.7, critical: 0.9 },
          memory: { warning: 0.8, critical: 0.95 },
          queueDepth: { warning: 100, critical: 500 },
        },
      });

      await degradationController.start();
      ctx.logger?.info('Degradation controller started', { workerId });
    }

    // Create workflow worker
    const worker = await createWorkflowWorker({
      workerId,
      redis: redisOptions,
      pollIntervalMs,
      maxConcurrentJobs,
      heartbeatIntervalMs: 5000,
      leaseTtlMs: 15000,
      logger: ctx.logger,
    });

    ctx.logger?.info('Workflow worker created', {
      workerId,
      role: actualRole,
      maxConcurrentJobs,
      pollIntervalMs,
    });

    // Start worker
    worker.start();

    ctx.logger?.info('Worker started successfully', {
      workerId,
      role: actualRole,
    });

    // Log metrics every 30 seconds
    const metricsInterval = setInterval(() => {
      const metrics = worker.getMetrics();
      ctx.logger?.info('Worker metrics', {
        workerId,
        ...metrics,
      });

      if (leaderElection) {
        const leaderMetrics = leaderElection.getMetrics();
        ctx.logger?.info('Leader election metrics', {
          workerId,
          ...leaderMetrics,
        });
      }

      if (degradationController) {
        const state = degradationController.getState();
        ctx.logger?.info('Degradation state', {
          workerId,
          state,
        });
      }
    }, 30000);

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      ctx.logger?.info('Received shutdown signal', { signal, workerId });

      clearInterval(metricsInterval);

      ctx.logger?.info('Stopping worker', { workerId });
      await worker.stop();

      if (cronScheduler) {
        ctx.logger?.info('Stopping cron scheduler', { workerId });
        cronScheduler.stop();
      }

      if (leaderElection) {
        ctx.logger?.info('Stopping leader election', { workerId });
        await leaderElection.stop();
      }

      if (degradationController) {
        ctx.logger?.info('Stopping degradation controller', { workerId });
        await degradationController.stop();
      }

      ctx.logger?.info('Disposing Redis connection', { workerId });
      await redis.dispose();

      ctx.logger?.info('Worker shutdown complete', { workerId });
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Keep process alive
    ctx.output?.write(`Worker ${workerId} running (role: ${actualRole})\n`);
    ctx.output?.write(`Press Ctrl+C to stop\n\n`);

    // Return result (though the process will keep running)
    return {
      success: true,
      workerId,
      role: actualRole,
      status: 'running',
    };
  },
});
