/**
 * @module @kb-labs/cli-commands/jobs/list
 * List all scheduled jobs
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { createRedisClient } from '@kb-labs/workflow-engine';

interface JobInfo {
  id: string;
  pluginId: string;
  handler: string;
  schedule: string;
  status: string;
  nextRun: string | null;
  lastRun: string | null;
  runCount: number;
}

type JobsListResult = CommandResult & {
  jobs?: JobInfo[];
};

export const jobsList = defineSystemCommand<
  {
    plugin: { type: 'string'; description?: string };
    status: { type: 'string'; description?: string; choices?: readonly string[] };
    json: { type: 'boolean'; description?: string; default?: boolean };
  },
  JobsListResult
>({
  name: 'list',
  description: 'List all scheduled jobs across plugins',
  category: 'jobs',
  flags: {
    plugin: {
      type: 'string',
      description: 'Filter by plugin ID',
    },
    status: {
      type: 'string',
      description: 'Filter by status (active, paused, completed, cancelled)',
      choices: ['active', 'paused', 'completed', 'cancelled'],
    },
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
  },
  async handler(ctx, argv, flags) {
    const redis = await createRedisClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    try {
      // Get all schedule IDs from sorted set
      const scheduleIds = await redis.client.zrange('kb:schedules:active', 0, -1);

      const jobs: JobInfo[] = [];

      for (const scheduleId of scheduleIds) {
        const data = await redis.client.get(`kb:schedule:${scheduleId}`);
        if (!data) continue;

        const schedule = JSON.parse(data);

        // Apply filters
        if (flags.plugin && schedule.pluginId !== flags.plugin) {
          continue;
        }
        if (flags.status && schedule.status !== flags.status) {
          continue;
        }

        jobs.push({
          id: scheduleId as string,
          pluginId: schedule.pluginId,
          handler: schedule.handler,
          schedule: schedule.schedule.cron || schedule.schedule,
          status: schedule.status,
          nextRun: schedule.nextRun ? new Date(schedule.nextRun).toISOString() : null,
          lastRun: schedule.lastRun ? new Date(schedule.lastRun).toISOString() : null,
          runCount: schedule.runCount,
        });
      }

      if (flags.json) {
        ctx.output?.json({ jobs });
      } else {
        if (jobs.length === 0) {
          ctx.output?.write('No scheduled jobs found\n');
          return { success: true, jobs: [] };
        }

        ctx.output?.write(`\nScheduled Jobs (${jobs.length}):\n\n`);

        for (const job of jobs) {
          ctx.output?.write(`  ${job.id}\n`);
          ctx.output?.write(`    Plugin:   ${job.pluginId}\n`);
          ctx.output?.write(`    Handler:  ${job.handler}\n`);
          ctx.output?.write(`    Schedule: ${job.schedule}\n`);
          ctx.output?.write(`    Status:   ${job.status}\n`);
          if (job.nextRun) {
            ctx.output?.write(`    Next Run: ${job.nextRun}\n`);
          }
          ctx.output?.write(`    Runs:     ${job.runCount}\n\n`);
        }
      }

      return { success: true, jobs };
    } finally {
      await redis.client.quit();
    }
  },
});
