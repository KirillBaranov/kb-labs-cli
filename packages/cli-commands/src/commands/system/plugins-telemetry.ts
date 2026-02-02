/**
 * plugins:telemetry command - Show telemetry metrics (if opt-in enabled)
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import { telemetry } from '../../registry/telemetry';

type PluginsTelemetryResult = CommandResult & {
  message?: string;
  metrics?: any;
  events?: any[];
  totalEvents?: number;
};

type PluginsTelemetryFlags = {
  json: { type: 'boolean'; description?: string };
  clear: { type: 'boolean'; description?: string };
};

export const pluginsTelemetry = defineSystemCommand<PluginsTelemetryFlags, PluginsTelemetryResult>({
  name: 'telemetry',
  description: 'Show telemetry metrics (requires opt-in)',
  category: 'plugins',
  examples: generateExamples('telemetry', 'plugins', [
    { flags: {} },
    { flags: { json: true } },
    { flags: { clear: true } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
    clear: { type: 'boolean', description: 'Clear collected metrics' },
  },
  analytics: {
    command: 'plugins:telemetry',
    startEvent: 'PLUGINS_TELEMETRY_STARTED',
    finishEvent: 'PLUGINS_TELEMETRY_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const clear = flags.clear; // Type-safe: boolean

    if (clear) {
      telemetry.clear();
      ctx.platform?.logger?.info('Telemetry cleared');
      return { ok: true, message: 'Telemetry cleared' };
    }

    const metrics = telemetry.getMetrics();
    const events = telemetry.getEvents();

    ctx.platform?.logger?.info('Telemetry metrics retrieved', { totalEvents: events.length });

    return {
      ok: true,
      metrics,
      events,
      totalEvents: events.length,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.ui.json(result);
      return;
    }

    // Check if telemetry is enabled
    if (process.env.KB_CLI_TELEMETRY_DISABLE === '1') {
      ctx.ui.warn('Telemetry is disabled via KB_CLI_TELEMETRY_DISABLE');
      return;
    }

    if (!result.events || result.events.length === 0) {
      ctx.ui.info('No telemetry data collected yet.');
      ctx.ui.info(
        'Enable telemetry by setting KB_CLI_TELEMETRY_ENABLE=1 or setting telemetry: "opt-in" in plugin manifest',
      );
      return;
    }

    const metrics = result.metrics;
    const events = result.events ?? [];

    const sections: string[] = [
      ctx.ui.colors.bold('Telemetry Metrics:'),
      '',
      ...ctx.ui.keyValue({
        'Total Events': `${events.length}`,
        'Discovery Events': `${metrics.discovery.total}`,
        'Registration Events': `${metrics.registration.total}`,
        'Execution Events': `${metrics.execution.total}`,
      }),
      '',
      ctx.ui.colors.bold('Discovery:'),
      '',
      ...ctx.ui.keyValue({
        'Avg Duration': `${Math.round(metrics.discovery.avgDuration)}ms`,
        'Cache Hit Rate': `${(metrics.discovery.cacheHitRate * 100).toFixed(1)}%`,
      }),
      '',
      ctx.ui.colors.bold('Registration:'),
      '',
      ...ctx.ui.keyValue({
        'Commands Registered': `${metrics.registration.total}`,
        Collisions: `${metrics.registration.collisions}`,
        Errors: `${metrics.registration.errors}`,
      }),
      '',
      ctx.ui.colors.bold('Execution:'),
      '',
      ...ctx.ui.keyValue({
        'Total Executions': `${metrics.execution.total}`,
        'Success Rate': `${(metrics.execution.successRate * 100).toFixed(1)}%`,
        'Avg Duration': `${Math.round(metrics.execution.avgDuration)}ms`,
      }),
    ];

    if (metrics.topErrors.length > 0) {
      sections.push('');
      sections.push(ctx.ui.colors.bold('Top Schema Errors:'));
      sections.push('');
      for (const err of metrics.topErrors.slice(0, 5)) {
        sections.push(`  ${ctx.ui.colors.warn(`× ${err.error}`)} (${err.count}x)`);
      }
    }

    sections.push('');
    sections.push(ctx.ui.colors.bold('Next Steps:'));
    sections.push('');
    sections.push(
      `  ${ctx.ui.colors.info('KB_CLI_TELEMETRY_ENABLE=1')}  ${ctx.ui.colors.muted('Enable global telemetry')}`,
    );
    sections.push(
      `  ${ctx.ui.colors.info('telemetry: "opt-in"')}  ${ctx.ui.colors.muted('Enable in plugin manifest')}`,
    );
    sections.push(
      `  ${ctx.ui.colors.info('kb plugins telemetry --clear')}  ${ctx.ui.colors.muted('Clear collected metrics')}`,
    );

    ctx.ui.info('Telemetry Metrics', { sections: [{ items: sections }] });
  },
});

