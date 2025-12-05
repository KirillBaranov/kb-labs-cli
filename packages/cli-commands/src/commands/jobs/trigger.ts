/**
 * @module @kb-labs/cli-commands/jobs/trigger
 * Manually trigger a job execution
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { createRedisClient } from '@kb-labs/workflow-engine';

type JobsTriggerResult = CommandResult & {
  jobId?: string;
};

export const jobsTrigger = defineSystemCommand<Record<string, never>, JobsTriggerResult>({
  name: 'trigger',
  description: 'Manually trigger a job execution',
  category: 'jobs',
  flags: {},
  examples: [
    'kb jobs trigger @kb-labs/mind:auto-index',
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

      ctx.output?.write(`Triggering job: ${jobId}\n`);

      // Emit triggered job to Redis pub/sub (same as CronScheduler does)
      const triggeredJob = {
        scheduleId: jobId,
        pluginId: schedule.pluginId,
        handler: schedule.handler,
        input: schedule.input,
        priority: schedule.priority,
        timeout: schedule.timeout,
        retries: schedule.retries,
        tags: [...(schedule.tags ?? []), 'manual-trigger'],
        scheduledAt: Date.now(),
      };

      await redis.client.publish('kb:cron:triggered', JSON.stringify(triggeredJob));

      ctx.output?.write(`✓ Job triggered: ${jobId}\n`);
      ctx.output?.write(`  Worker will execute this job shortly\n`);
      ctx.output?.write(`  Use 'kb jobs status ${jobId}' to check schedule status\n`);

      return { ok: true, jobId };
    } finally {
      await redis.client.quit();
    }
  },
});
