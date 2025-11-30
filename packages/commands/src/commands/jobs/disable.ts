/**
 * @module @kb-labs/cli-commands/jobs/disable
 * Disable a scheduled job
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { createRedisClient } from '@kb-labs/workflow-engine';

type JobsDisableResult = CommandResult & {
  jobId?: string;
};

export const jobsDisable = defineSystemCommand<Record<string, never>, JobsDisableResult>({
  name: 'disable',
  description: 'Disable a scheduled job',
  category: 'jobs',
  examples: [
    'kb jobs disable @kb-labs/mind:auto-index',
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
        throw new Error(`Job not found: ${jobId}`);
      }

      const schedule = JSON.parse(data);

      if (schedule.status === 'paused') {
        ctx.output?.write(`Job ${jobId} is already disabled\n`);
        return { success: true, jobId };
      }

      // Update status
      schedule.status = 'paused';

      // Save to Redis
      await redis.client.set(scheduleKey, JSON.stringify(schedule));

      // Remove from active sorted set
      await redis.client.zrem('kb:schedules:active', jobId);

      ctx.output?.write(`✓ Job ${jobId} disabled\n`);

      return { success: true, jobId };
    } finally {
      await redis.client.quit();
    }
  },
});
