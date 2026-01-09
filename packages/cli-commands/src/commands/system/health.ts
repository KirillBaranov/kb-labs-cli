// TODO: This file needs major refactoring to align with CommandResult contract
// - HealthResult uses custom 'status' field ('healthy'|'degraded'|'unhealthy') instead of CommandStatus
// - HealthSnapshot type is not properly defined
// - Formatter accesses untyped snapshot properties
// @ts-nocheck
import { createCliAPI } from '@kb-labs/cli-api';
import { generateExamples } from '../../utils/generate-examples';
import { defineSystemCommand } from '@kb-labs/shared-command-kit';

type HealthFlags = {
  json: { type: 'boolean'; description?: string };
};

// TODO: HealthSnapshot type should be defined in @kb-labs/cli-api
// Currently using inline type until proper health API is implemented
type HealthSnapshot = Record<string, unknown>;

type HealthResult = {
  ok: boolean; // Required by CommandResult
  status: 'healthy' | 'degraded' | 'unhealthy';
  snapshot?: HealthSnapshot;
  error?: string;
};

// TODO: HealthResult has custom status field ('healthy'|'degraded'|'unhealthy') that doesn't match CommandStatus
// Need to align health command result type with CommandResult contract
export const health = defineSystemCommand<HealthFlags>({
  name: 'health',
  description: 'Report overall CLI health snapshot',
  longDescription: 'Shows the kb.health/1 snapshot shared with REST and Studio.',
  category: 'info',
  examples: generateExamples('health', 'kb', [
    { flags: {} },
    { flags: { json: true } },
  ]),
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
      ctx.platform?.logger?.info('Health check started');

      const snapshot = await cliApi.getSystemHealth({
        uptimeSec: process.uptime(),
        version: { rest: 'n/a' },
        meta: { source: 'cli' },
      });

      ctx.platform?.logger?.info('Health check completed', { status: snapshot.status });

      return {
        ok: snapshot.status === 'healthy',
        status: snapshot.status,
        snapshot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.platform?.logger?.error('Health check failed', { error: message });

      return {
        ok: false,
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
        ctx.ui.error('System Health', {
          sections: [
            {
              header: 'Status',
              items: [`Status: ${result.status}`, `Error: ${result.error}`],
            },
          ],
        });
      } else if (result.snapshot) {
        // Success case
        const snapshot = result.snapshot;
        const gitInfo = snapshot.version.git
          ? `${snapshot.version.git.sha}${snapshot.version.git.dirty ? ' (dirty)' : ''}`
          : 'n/a';

        const sections = [
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
        ];

        if (result.status === 'healthy') {
          ctx.ui.success('System Health', { sections });
        } else {
          ctx.ui.warn('System Health', { sections });
        }
      }
    }
  },
});

