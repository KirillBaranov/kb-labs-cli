/**
 * @module @kb-labs/cli-commands/jobs/status
 * Show job status
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { createRedisClient } from '@kb-labs/workflow-engine';

type JobsStatusResult = CommandResult & {
  jobId?: string;
  status?: string;
};

export const jobsStatus = defineSystemCommand<
  {
    json: { type: 'boolean'; description?: string; default?: boolean };
  },
  JobsStatusResult
>({
  name: 'status',
  description: 'Show job schedule status',
  category: 'jobs',
  flags: {
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
  },
  examples: [
    'kb jobs status @kb-labs/mind:auto-index',
  ],
  async handler(ctx, argv, flags) {
    const jobId = argv[0];
    if (!jobId) {
      throw new Error('Job ID required (format: @plugin-id:job-id)');
    }

    const redis = await createRedisClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    try {
      const scheduleKey = `kb:schedule:${jobId}`;
      const data = await redis.client.get(scheduleKey);

      if (!data) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const schedule = JSON.parse(data);

      const status = {
        id: jobId,
        pluginId: schedule.pluginId,
        handler: schedule.handler,
        schedule: schedule.schedule.cron || schedule.schedule,
        status: schedule.status,
        nextRun: new Date(schedule.nextRun).toISOString(),
        lastRun: schedule.lastRun ? new Date(schedule.lastRun).toISOString() : null,
        runCount: schedule.runCount,
        priority: schedule.priority,
        timeout: schedule.timeout,
        retries: schedule.retries,
        tags: schedule.tags,
      };

      if (flags.json) {
        ctx.output?.json(status);
      } else {
        ctx.output?.write(`\nJob Status: ${jobId}\n\n`);
        ctx.output?.write(`  Plugin:    ${status.pluginId}\n`);
        ctx.output?.write(`  Handler:   ${status.handler}\n`);
        ctx.output?.write(`  Schedule:  ${status.schedule}\n`);
        ctx.output?.write(`  Status:    ${status.status}\n`);
        ctx.output?.write(`  Next Run:  ${status.nextRun}\n`);
        if (status.lastRun) {
          ctx.output?.write(`  Last Run:  ${status.lastRun}\n`);
        }
        ctx.output?.write(`  Run Count: ${status.runCount}\n`);
        ctx.output?.write(`  Priority:  ${status.priority}\n`);
        ctx.output?.write(`  Timeout:   ${status.timeout}ms\n`);
        ctx.output?.write(`  Retries:   ${status.retries}\n`);
        if (status.tags && status.tags.length > 0) {
          ctx.output?.write(`  Tags:      ${status.tags.join(', ')}\n`);
        }
        ctx.output?.write('\n');
      }

      return { success: true, jobId, status: status.status };
    } finally {
      await redis.client.quit();
    }
  },
});
