/**
 * @module @kb-labs/cli-commands/jobs/loader
 * Job loader - loads and registers jobs from plugin manifests
 */

import type { ManifestV3, JobDecl } from '@kb-labs/plugin-contracts';
import type { CronScheduler } from '@kb-labs/workflow-engine';
import { parseSchedule } from '@kb-labs/workflow-engine';

export interface PluginInfo {
  id: string;
  kind: string;
  manifest?: ManifestV3 | unknown;
}

export interface JobLoaderOptions {
  cronScheduler: CronScheduler;
  plugins: PluginInfo[];
  logger?: {
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
    debug: (msg: string, meta?: any) => void;
  };
}

/**
 * Load and register all jobs from plugin manifests
 *
 * Similar to PluginWorkflowRegistry.list() pattern:
 * - Discover all plugins
 * - Read manifest.jobs[] from each plugin
 * - Register with CronScheduler
 */
export async function loadPluginJobs(options: JobLoaderOptions): Promise<void> {
  const { cronScheduler, plugins, logger } = options;

  logger?.info('Loading jobs from plugin manifests', {
    pluginCount: plugins.length,
  });

  let totalJobsLoaded = 0;
  let totalJobsSkipped = 0;

  for (const plugin of plugins) {
    // Only process V2 manifests
    if (plugin.kind !== 'v2') {
      logger?.debug('Skipping non-V2 plugin', { pluginId: plugin.id });
      continue;
    }

    const manifest = plugin.manifest as ManifestV3;

    if (!manifest || !manifest.jobs || manifest.jobs.length === 0) {
      logger?.debug('No jobs declared in plugin', { pluginId: plugin.id });
      continue;
    }

    logger?.info(`Loading jobs for plugin: ${manifest.id}`, {
      pluginId: manifest.id,
      jobCount: manifest.jobs.length,
    });

    for (const job of manifest.jobs) {
      // Skip if job is explicitly disabled
      if (job.enabled === false) {
        logger?.info(`Skipping disabled job`, {
          pluginId: manifest.id,
          jobId: job.id,
        });
        totalJobsSkipped++;
        continue;
      }

      // Validate schedule
      const parsed = parseSchedule(job.schedule);
      if (!parsed) {
        logger?.warn(`Invalid schedule expression, skipping job`, {
          pluginId: manifest.id,
          jobId: job.id,
          schedule: job.schedule,
        });
        totalJobsSkipped++;
        continue;
      }

      try {
        // Register job with CronScheduler
        // Schedule ID format: @pluginId:jobId (same as workflow pattern: plugin:pluginId/workflowId)
        const scheduleId = `${manifest.id}:${job.id}`;

        await cronScheduler.register(
          scheduleId,
          manifest.id,
          job.handler,
          job.schedule,
          job.input,
          {
            priority: job.priority ?? 5,
            timeout: job.timeout ?? 1200000,
            retries: job.retries ?? 2,
            tags: [...(job.tags ?? []), 'manifest-loaded'],
            startAt: job.startAt,
            endAt: job.endAt,
            maxRuns: job.maxRuns,
          }
        );

        logger?.info(`Registered job`, {
          pluginId: manifest.id,
          jobId: job.id,
          scheduleId,
          schedule: job.schedule,
        });

        totalJobsLoaded++;
      } catch (error) {
        logger?.error(`Failed to register job`, {
          pluginId: manifest.id,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        totalJobsSkipped++;
      }
    }
  }

  logger?.info('Job loading completed', {
    totalPlugins: plugins.length,
    jobsLoaded: totalJobsLoaded,
    jobsSkipped: totalJobsSkipped,
  });
}

/**
 * Helper to extract jobs from manifest (similar to getPluginWorkflows)
 */
export function getPluginJobs(manifest: unknown): JobDecl[] {
  const m = manifest as { jobs?: JobDecl[] };
  return m.jobs ?? [];
}
