import { createCliAPI } from '@kb-labs/cli-api';
import { defineSystemCommand } from '@kb-labs/cli-command-kit';
import type { HealthSnapshot } from '@kb-labs/cli-api';

type HealthFlags = {
  json: { type: 'boolean'; description?: string };
};

type HealthResult = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  snapshot?: HealthSnapshot;
  error?: string;
};

export const health = defineSystemCommand<HealthFlags, HealthResult>({
  name: 'health',
  description: 'Report overall CLI health snapshot',
  longDescription: 'Shows the kb.health/1 snapshot shared with REST and Studio.',
  category: 'info',
  examples: ['kb health', 'kb health --json'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'health',
    startEvent: 'HEALTH_STARTED',
    finishEvent: 'HEALTH_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cliApi = await createCliAPI({
      cache: { inMemory: true, ttlMs: 5000 },
    });

    try {
      ctx.logger?.info('Health check started');

      const snapshot = await cliApi.getSystemHealth({
        uptimeSec: process.uptime(),
        version: { rest: 'n/a' },
        meta: { source: 'cli' },
      });

      ctx.logger?.info('Health check completed', { status: snapshot.status });

      return {
        status: snapshot.status,
        snapshot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.error('Health check failed', { error: message });

      return {
        status: 'degraded' as const,
        error: message,
      };
    } finally {
      await cliApi.dispose();
    }
  },
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      const jsonOutput = result.snapshot || {
        schema: 'kb.health/1',
        status: result.status,
        error: result.error,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      // Build UI from result data
      if (result.error) {
        // Error case
        const output = ctx.output.ui.sideBox({
          title: 'System Health',
          sections: [
            {
              header: 'Status',
              items: [`Status: ${result.status}`, `Error: ${result.error}`],
            },
          ],
          status: 'error',
          timing: ctx.tracker.total(),
        });
        console.log(output);
      } else if (result.snapshot) {
        // Success case
        const snapshot = result.snapshot;
        const gitInfo = snapshot.version.git
          ? `${snapshot.version.git.sha}${snapshot.version.git.dirty ? ' (dirty)' : ''}`
          : 'n/a';

        const status = result.status === 'healthy' ? 'success' : 'warning';

        const output = ctx.output.ui.sideBox({
          title: 'System Health',
          sections: [
            {
              header: 'Status',
              items: [
                `Status: ${snapshot.status}`,
                `KB Labs: ${snapshot.version.kbLabs}`,
                `CLI: ${snapshot.version.cli}`,
                `REST: ${snapshot.version.rest}`,
                `Git: ${gitInfo}`,
              ],
            },
            {
              header: 'Registry',
              items: [
                `Plugins: ${snapshot.registry.total} total (rest ${snapshot.registry.withRest}, studio ${snapshot.registry.withStudio})`,
                `Errors: ${snapshot.registry.errors}`,
                `Generated: ${snapshot.registry.generatedAt}`,
                `Expires: ${snapshot.registry.expiresAt ?? 'n/a'}`,
                `Partial: ${snapshot.registry.partial ? 'yes' : 'no'}`,
                `Stale: ${snapshot.registry.stale ? 'yes' : 'no'}`,
              ],
            },
            {
              header: 'System',
              items: [`Uptime: ${snapshot.uptimeSec}s`],
            },
          ],
          status,
          timing: ctx.tracker.total(),
        });
        console.log(output);
      }
    }
  },
});

