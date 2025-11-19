import { createCliAPI } from '@kb-labs/cli-api';
import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import type { Output } from '@kb-labs/core-sys/output';

function formatStatus(status: 'healthy' | 'degraded', output: Output): string {
  const icon = status === 'healthy' ? output.ui.symbols.success : output.ui.symbols.warning;
  const colorize = status === 'healthy' ? output.ui.colors.success : output.ui.colors.warning;
  return `${icon} ${colorize(status)}`;
}

type HealthResult = CommandResult & {
  snapshot?: {
    schema: string;
    status: 'healthy' | 'degraded';
    version: {
      kbLabs: string;
      cli: string;
      rest: string;
      git?: {
        sha: string;
        dirty: boolean;
      };
    };
    registry: {
      total: number;
      withRest: number;
      withStudio: number;
      errors: number;
      generatedAt: string;
      expiresAt?: string;
      partial: boolean;
      stale: boolean;
    };
    uptimeSec: number;
    components: Array<{
      id: string;
      lastError?: string;
    }>;
    error?: string;
  };
};

type HealthFlags = {
  json: { type: 'boolean'; description?: string };
};

export const health = defineSystemCommand<HealthFlags, HealthResult>({
  name: 'health',
  description: 'Report overall CLI health snapshot',
  longDescription: 'Shows the kb.health/1 snapshot shared with REST and Studio.',
  category: 'system',
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

      return { ok: true, snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.error('Health check failed', { error: message });

      return {
        ok: false,
        error: message,
        snapshot: {
          schema: 'kb.health/1',
          status: 'degraded' as const,
          error: message,
        },
      };
    } finally {
      await cliApi.dispose();
    }
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result.snapshot || result);
    } else {
      if (!ctx.output) {
        throw new Error('Output not available');
      }

      const snapshot = result.snapshot;
      if (!snapshot) {
        ctx.output?.error(new Error(result.error ?? 'Unknown error'));
        return;
      }

      const summary: Record<string, string> = {
        Status: formatStatus(snapshot.status, ctx.output),
        'KB Labs': snapshot.version.kbLabs,
        CLI: snapshot.version.cli,
        REST: snapshot.version.rest,
        Plugins: `${snapshot.registry.total} total (rest ${snapshot.registry.withRest}, studio ${snapshot.registry.withStudio})`,
        Errors: String(snapshot.registry.errors),
        'Generated at': snapshot.registry.generatedAt,
        Expires: snapshot.registry.expiresAt ?? 'n/a',
        Partial: snapshot.registry.partial ? 'yes' : 'no',
        Stale: snapshot.registry.stale ? 'yes' : 'no',
        Uptime: `${snapshot.uptimeSec}s`,
      };

      if (snapshot.version.git) {
        summary.Git = `${snapshot.version.git.sha}${snapshot.version.git.dirty ? ' (dirty)' : ''}`;
      }

      const lines = [...ctx.output.ui.keyValue(summary)];

      const impacted = snapshot.components.filter((component: any) => component.lastError);
      if (impacted.length > 0) {
        lines.push('', ctx.output.ui.colors.muted('Components with issues:'));
        for (const component of impacted) {
          lines.push(`  ${ctx.output.ui.symbols.warning} ${component.id} ${component.lastError}`);
        }
      }

      const output = ctx.output.ui.box('System Health', lines);
      ctx.output.write(output);
    }
  },
});

