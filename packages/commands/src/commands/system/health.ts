import { createCliAPI } from '@kb-labs/cli-api';
import { box, keyValue, safeColors, safeSymbols } from '@kb-labs/shared-cli-ui';
import type { Command } from "../../types";

function formatStatus(status: 'healthy' | 'degraded'): string {
  const icon = status === 'healthy' ? safeSymbols.success : safeSymbols.warning;
  const colorize = status === 'healthy' ? safeColors.success : safeColors.warning;
  return `${icon} ${colorize(status)}`;
}

export const health: Command = {
  name: "health",
  category: "system",
  describe: "Report overall CLI health snapshot",
  longDescription: "Shows the kb.health/1 snapshot shared with REST and Studio.",
  examples: [
    "kb health",
    "kb health --json",
  ],
  async run(ctx, _argv, flags) {
    const jsonMode = Boolean(flags?.json);
    const cliApi = await createCliAPI({
      cache: { inMemory: true, ttlMs: 5000 },
    });

    try {
      const snapshot = await cliApi.getSystemHealth({
        uptimeSec: process.uptime(),
        version: { rest: 'n/a' },
        meta: { source: 'cli' },
      });

      if (jsonMode) {
        ctx.presenter.json(snapshot);
        return 0;
      }

      const summary: Record<string, string> = {
        Status: formatStatus(snapshot.status),
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

      const lines = [
        ...keyValue(summary),
      ];

      const impacted = snapshot.components.filter(component => component.lastError);
      if (impacted.length > 0) {
        lines.push('', safeColors.dim('Components with issues:'));
        for (const component of impacted) {
          lines.push(`  ${safeSymbols.warning} ${component.id} ${component.lastError}`);
        }
      }

      const output = box('System Health', lines);
      ctx.presenter.write(output);

      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        ctx.presenter.json({
          schema: 'kb.health/1',
          status: 'degraded',
          error: message,
        });
      } else {
        ctx.presenter.error(message);
      }
      return 0;
    } finally {
      await cliApi.dispose();
    }
  },
};

