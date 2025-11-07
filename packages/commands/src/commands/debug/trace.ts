/**
 * trace command - Visualize cross-plugin traces
 */

import type { Command } from '../../types/types';
import { loadTrace, listTraces, formatFlamegraph, exportChromeFormat, type TraceData } from '@kb-labs/plugin-runtime';
import type { CliContext } from '@kb-labs/cli-core';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { getContextCwd } from '../../utils/context';

export const trace: Command = {
  name: 'trace',
  category: 'debug',
  describe: 'Visualize cross-plugin execution traces',
  flags: [
    {
      name: 'list',
      type: 'boolean',
      description: 'List all available traces',
    },
    {
      name: 'last',
      type: 'boolean',
      description: 'Show the last trace',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
    },
    {
      name: 'export',
      type: 'string',
      description: 'Export trace to file (chrome format)',
    },
  ],
  examples: [
    'kb trace <trace-id>',
    'kb trace --list',
    'kb trace --last',
  ],

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>) {
    const jsonMode = Boolean(flags.json);
    const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });

    // List traces
    if (flags.list) {
      const traces = await listTraces(cwd);
      
      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          traces: traces.map((t: TraceData) => ({
            id: t.id,
            traceId: t.traceId,
            startTime: t.startTime,
            totalDuration: t.totalDuration,
            plugins: t.plugins,
            spans: t.spans.length,
            errors: t.errors,
          })),
        });
        return 0;
      }

      if (traces.length === 0) {
        ctx.presenter.info('No traces found');
        return 0;
      }

      ctx.presenter.info(`Found ${traces.length} trace(s):\n`);
      for (const trace of traces) {
        const timestamp = new Date(trace.startTime).toLocaleString();
        const status = trace.errors > 0 ? '✗' : '✓';
        ctx.presenter.info(`${status} ${trace.id} - ${trace.plugins.length} plugins, ${trace.spans.length} spans`);
        ctx.presenter.info(`   ${timestamp}`);
        if (trace.totalDuration) {
          ctx.presenter.info(`   Duration: ${trace.totalDuration}ms`);
        }
        if (trace.errors > 0) {
          ctx.presenter.info(`   Errors: ${trace.errors}`);
        }
      }
      return 0;
    }

    // Show trace
    let traceId: string | undefined;
    
    if (flags.last) {
      const traces = await listTraces(cwd);
      const [latestTrace] = traces;
      if (!latestTrace) {
        ctx.presenter.error('No traces found');
        return 1;
      }
      traceId = latestTrace.id;
    } else if (argv.length > 0) {
      traceId = argv[0];
    } else {
      ctx.presenter.error('Please provide trace ID or use --last flag');
      ctx.presenter.info('Use `kb trace --list` to see available traces');
      return 1;
    }

    if (!traceId) {
      ctx.presenter.error('Trace ID is required');
      return 1;
    }

    // Load trace
    const trace = await loadTrace(traceId, cwd);
    if (!trace) {
      ctx.presenter.error(`Trace not found: ${traceId}`);
      ctx.presenter.info('Use `kb trace --list` to see available traces');
      return 1;
    }

    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        trace: {
          id: trace.id,
          traceId: trace.traceId,
          startTime: trace.startTime,
          totalDuration: trace.totalDuration,
          plugins: trace.plugins,
          spans: trace.spans,
          errors: trace.errors,
        },
      });
      return 0;
    }

    // Export to Chrome DevTools format if requested
    if (flags.export && typeof flags.export === 'string') {
      try {
        const chromeFormat = exportChromeFormat(trace);
        const exportPath = path.resolve(flags.export);
        await fs.writeFile(exportPath, JSON.stringify(chromeFormat, null, 2), 'utf8');
        ctx.presenter.info(`Trace exported to: ${exportPath}`);
        ctx.presenter.info('Open in Chrome DevTools: chrome://tracing -> Load');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.presenter.error(`Failed to export trace: ${message}`);
        return 1;
      }
      return 0;
    }

    // Show flamegraph
    ctx.presenter.info(formatFlamegraph(trace));
    
    return 0;
  },
};

