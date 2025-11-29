/**
 * @module @kb-labs/cli-commands/jobs/enable
 * Enable a scheduled job
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { createRedisClient, parseSchedule, getNextRun } from '@kb-labs/workflow-engine';

type JobsEnableResult = CommandResult & {
  jobId?: string;
  nextRun?: string;
};

export const jobsEnable = defineSystemCommand<Record<string, never>, JobsEnableResult>({
  name: 'enable',
  description: 'Enable a scheduled job',
  category: 'jobs',
  examples: [
    'kb jobs enable @kb-labs/mind:auto-index',
  ],
  async handler(ctx, argv) {
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
        throw new Error(`Job not found: ${jobId}. Make sure the worker has loaded jobs from manifests.`);
      }

      const schedule = JSON.parse(data);

      if (schedule.status === 'active') {
        ctx.output?.write(`Job ${jobId} is already enabled\n`);
        return { success: true, jobId };
      }

      // Update status
      schedule.status = 'active';

      // Recalculate next run
      const now = Date.now();
      const parsed = parseSchedule(schedule.schedule.cron || schedule.schedule);
      if (!parsed) {
        throw new Error(`Invalid schedule expression: ${schedule.schedule}`);
      }
      schedule.nextRun = getNextRun(parsed, now);

      // Save to Redis
      await redis.client.set(scheduleKey, JSON.stringify(schedule));

      // Add to active sorted set
      await redis.client.zadd('kb:schedules:active', schedule.nextRun, jobId);

      const nextRunDate = new Date(schedule.nextRun).toISOString();

      ctx.output?.write(`✓ Job ${jobId} enabled\n`);
      ctx.output?.write(`  Next run: ${nextRunDate}\n`);
      ctx.output?.write(`  Schedule: ${schedule.schedule.cron || schedule.schedule}\n`);

      return { success: true, jobId, nextRun: nextRunDate };
    } finally {
      await redis.client.quit();
    }
  },
});
