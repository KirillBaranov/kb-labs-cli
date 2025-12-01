/**
 * plugins:telemetry command - Show telemetry metrics (if opt-in enabled)
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { telemetry } from '../../registry/telemetry';
import { generateExamples } from '@kb-labs/plugin-manifest';

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
      ctx.logger?.info('Telemetry cleared');
      return { ok: true, message: 'Telemetry cleared' };
    }

    const metrics = telemetry.getMetrics();
    const events = telemetry.getEvents();

    ctx.logger?.info('Telemetry metrics retrieved', { totalEvents: events.length });

    return {
      ok: true,
      metrics,
      events,
      totalEvents: events.length,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
      return;
    }

    if (!ctx.output) {
      throw new Error('Output not available');
    }

    // Check if telemetry is enabled
    if (process.env.KB_CLI_TELEMETRY_DISABLE === '1') {
      ctx.output.warn('Telemetry is disabled via KB_CLI_TELEMETRY_DISABLE');
      return;
    }

    if (!result.events || result.events.length === 0) {
      ctx.output.info('No telemetry data collected yet.');
      ctx.output.info(
        'Enable telemetry by setting KB_CLI_TELEMETRY_ENABLE=1 or setting telemetry: "opt-in" in plugin manifest',
      );
      return;
    }

    const metrics = result.metrics;
    const events = result.events ?? [];

    const sections: string[] = [
      ctx.output.ui.colors.bold('Telemetry Metrics:'),
      '',
      ...ctx.output.ui.keyValue({
        'Total Events': `${events.length}`,
        'Discovery Events': `${metrics.discovery.total}`,
        'Registration Events': `${metrics.registration.total}`,
        'Execution Events': `${metrics.execution.total}`,
      }),
      '',
      ctx.output.ui.colors.bold('Discovery:'),
      '',
      ...ctx.output.ui.keyValue({
        'Avg Duration': `${Math.round(metrics.discovery.avgDuration)}ms`,
        'Cache Hit Rate': `${(metrics.discovery.cacheHitRate * 100).toFixed(1)}%`,
      }),
      '',
      ctx.output.ui.colors.bold('Registration:'),
      '',
      ...ctx.output.ui.keyValue({
        'Commands Registered': `${metrics.registration.total}`,
        Collisions: `${metrics.registration.collisions}`,
        Errors: `${metrics.registration.errors}`,
      }),
      '',
      ctx.output.ui.colors.bold('Execution:'),
      '',
      ...ctx.output.ui.keyValue({
        'Total Executions': `${metrics.execution.total}`,
        'Success Rate': `${(metrics.execution.successRate * 100).toFixed(1)}%`,
        'Avg Duration': `${Math.round(metrics.execution.avgDuration)}ms`,
      }),
    ];

    if (metrics.topErrors.length > 0) {
      sections.push('');
      sections.push(ctx.output.ui.colors.bold('Top Schema Errors:'));
      sections.push('');
      for (const err of metrics.topErrors.slice(0, 5)) {
        sections.push(`  ${ctx.output.ui.colors.warn(`× ${err.error}`)} (${err.count}x)`);
      }
    }

    sections.push('');
    sections.push(ctx.output.ui.colors.bold('Next Steps:'));
    sections.push('');
    sections.push(
      `  ${ctx.output.ui.colors.info('KB_CLI_TELEMETRY_ENABLE=1')}  ${ctx.output.ui.colors.muted('Enable global telemetry')}`,
    );
    sections.push(
      `  ${ctx.output.ui.colors.info('telemetry: "opt-in"')}  ${ctx.output.ui.colors.muted('Enable in plugin manifest')}`,
    );
    sections.push(
      `  ${ctx.output.ui.colors.info('kb plugins telemetry --clear')}  ${ctx.output.ui.colors.muted('Clear collected metrics')}`,
    );

    const output = ctx.output.ui.sideBox({
      title: 'Telemetry Metrics',
      sections: [{ items: sections }],
      status: 'info',
      timing: ctx.tracker.total(),
    });
    ctx.output.write(output);
  },
});

