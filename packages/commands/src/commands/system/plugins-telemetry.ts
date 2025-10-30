/**
 * plugins:telemetry command - Show telemetry metrics (if opt-in enabled)
 */

import type { Command } from "../../types/types.js";
import { telemetry } from '../../registry/telemetry.js';
import { box, keyValue, safeColors, safeSymbols } from "@kb-labs/shared-cli-ui";

export const pluginsTelemetry: Command = {
  name: "plugins:telemetry",
  category: "system",
  describe: "Show telemetry metrics (requires opt-in)",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
    {
      name: "clear",
      type: "boolean",
      description: "Clear collected metrics",
    },
  ],
  examples: [
    "kb plugins telemetry",
    "kb plugins telemetry --json",
    "kb plugins telemetry --clear",
  ],

  async run(ctx, argv, flags) {
    const jsonMode = !!flags.json;
    const clear = !!flags.clear;
    
    if (clear) {
      telemetry.clear();
      if (jsonMode) {
        ctx.presenter.json({ ok: true, message: "Telemetry cleared" });
      } else {
        ctx.presenter.info(`${safeSymbols.success} Telemetry cleared`);
      }
      return 0;
    }
    
    const metrics = telemetry.getMetrics();
    const events = telemetry.getEvents();
    
    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        metrics,
        events,
        totalEvents: events.length,
      });
      return 0;
    }
    
    // Check if telemetry is enabled
    if (process.env.KB_CLI_TELEMETRY_DISABLE === '1') {
      ctx.presenter.warn('Telemetry is disabled via KB_CLI_TELEMETRY_DISABLE');
      return 0;
    }
    
    if (events.length === 0) {
      ctx.presenter.info('No telemetry data collected yet.');
      ctx.presenter.info('Enable telemetry by setting KB_CLI_TELEMETRY_ENABLE=1 or setting telemetry: "opt-in" in plugin manifest');
      return 0;
    }
    
    const sections: string[] = [
      safeColors.bold('Telemetry Metrics:'),
      '',
      ...keyValue({
        'Total Events': `${events.length}`,
        'Discovery Events': `${metrics.discovery.total}`,
        'Registration Events': `${metrics.registration.total}`,
        'Execution Events': `${metrics.execution.total}`,
      }),
      '',
      safeColors.bold('Discovery:'),
      '',
      ...keyValue({
        'Avg Duration': `${Math.round(metrics.discovery.avgDuration)}ms`,
        'Cache Hit Rate': `${(metrics.discovery.cacheHitRate * 100).toFixed(1)}%`,
      }),
      '',
      safeColors.bold('Registration:'),
      '',
      ...keyValue({
        'Commands Registered': `${metrics.registration.total}`,
        'Collisions': `${metrics.registration.collisions}`,
        'Errors': `${metrics.registration.errors}`,
      }),
      '',
      safeColors.bold('Execution:'),
      '',
      ...keyValue({
        'Total Executions': `${metrics.execution.total}`,
        'Success Rate': `${(metrics.execution.successRate * 100).toFixed(1)}%`,
        'Avg Duration': `${Math.round(metrics.execution.avgDuration)}ms`,
      }),
    ];
    
    if (metrics.topErrors.length > 0) {
      sections.push('');
      sections.push(safeColors.bold('Top Schema Errors:'));
      sections.push('');
      for (const err of metrics.topErrors.slice(0, 5)) {
        sections.push(`  ${safeColors.warning(`× ${err.error}`)} (${err.count}x)`);
      }
    }
    
    sections.push('');
    sections.push(safeColors.bold('Next Steps:'));
    sections.push('');
    sections.push(`  ${safeColors.info('KB_CLI_TELEMETRY_ENABLE=1')}  ${safeColors.dim('Enable global telemetry')}`);
    sections.push(`  ${safeColors.info('telemetry: "opt-in"')}  ${safeColors.dim('Enable in plugin manifest')}`);
    sections.push(`  ${safeColors.info('kb plugins telemetry --clear')}  ${safeColors.dim('Clear collected metrics')}`);
    
    const output = box('Telemetry Metrics', sections);
    ctx.presenter.write(output);
    
    return 0;
  },
};

