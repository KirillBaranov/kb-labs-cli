/**
 * trace command - Visualize cross-plugin traces
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { loadTrace, listTraces, formatFlamegraph, exportChromeFormat, type TraceData } from '@kb-labs/plugin-runtime';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type TraceResult = CommandResult & {
  mode?: 'list' | 'show' | 'export';
  traces?: Array<{
    id: string;
    traceId: string;
    startTime: string | number;
    totalDuration: number | undefined;
    plugins: string[];
    spans: number;
    errors: number;
  }>;
  trace?: TraceData;
  exported?: string;
  exportPath?: string;
  flamegraph?: string;
};

type TraceFlags = {
  list: { type: 'boolean'; description?: string };
  last: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
  export: { type: 'string'; description?: string };
};

export const trace = defineSystemCommand<TraceFlags, TraceResult>({
  name: 'trace',
  description: 'Visualize cross-plugin execution traces',
  category: 'debug',
  examples: ['kb trace <trace-id>', 'kb trace --list', 'kb trace --last'],
  flags: {
    list: { type: 'boolean', description: 'List all available traces' },
    last: { type: 'boolean', description: 'Show the last trace' },
    json: { type: 'boolean', description: 'Output in JSON format' },
    export: { type: 'string', description: 'Export trace to file (chrome format)' },
  },
  analytics: {
    command: 'trace',
    startEvent: 'TRACE_STARTED',
    finishEvent: 'TRACE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);

    // List traces
    if (flags.list) {
      const traces = await listTraces(cwd);

      ctx.logger?.info('Traces listed', { count: traces.length });

      return {
        ok: true,
        mode: 'list' as const,
        traces: traces.map((t: TraceData) => ({
          id: t.id,
          traceId: t.traceId,
          startTime: typeof t.startTime === 'string' ? t.startTime : new Date(t.startTime).toISOString(),
          totalDuration: t.totalDuration ?? 0,
          plugins: t.plugins,
          spans: t.spans.length,
          errors: Array.isArray(t.errors) ? t.errors.length : (typeof t.errors === 'number' ? t.errors : 0),
        })),
      };
    }

    // Show trace
    let traceId: string | undefined;

    if (flags.last) {
      const traces = await listTraces(cwd);
      const [latestTrace] = traces;
      if (!latestTrace) {
        throw new Error('No traces found');
      }
      traceId = latestTrace.id;
    } else if (argv.length > 0) {
      traceId = argv[0];
    } else {
      throw new Error('Please provide trace ID or use --last flag');
    }

    if (!traceId) {
      throw new Error('Trace ID is required');
    }

    // Load trace
    const traceData = await loadTrace(traceId, cwd);
    if (!traceData) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    ctx.logger?.info('Trace loaded', { traceId, plugins: traceData.plugins.length, spans: traceData.spans.length });

    // Export to Chrome DevTools format if requested
    if (flags.export && typeof flags.export === 'string') {
      const chromeFormat = exportChromeFormat(traceData);
      const exportPath = path.resolve(flags.export);
      await fs.writeFile(exportPath, JSON.stringify(chromeFormat, null, 2), 'utf8');

      ctx.logger?.info('Trace exported', { traceId, exportPath });

      return {
        ok: true,
        mode: 'export' as const,
        traceId,
        exported: exportPath,
        exportPath,
      };
    }

    return {
      ok: true,
      mode: 'show' as const,
      trace: traceData, // Return full TraceData
      flamegraph: formatFlamegraph(traceData),
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

    // List mode
    if (result.mode === 'list') {
      const traces = result.traces ?? [];
      if (traces.length === 0) {
        ctx.output?.info('No traces found');
        return;
      }

      ctx.output?.info(`Found ${traces.length} trace(s):\n`);
      for (const trace of traces) {
        const timestamp = new Date(trace.startTime).toLocaleString();
        const status = trace.errors > 0 ? '✗' : '✓';
        ctx.output?.info(`${status} ${trace.id} - ${trace.plugins.length} plugins, ${trace.spans} spans`);
        ctx.output?.info(`   ${timestamp}`);
        if (trace.totalDuration) {
          ctx.output?.info(`   Duration: ${trace.totalDuration}ms`);
        }
        if (trace.errors > 0) {
          ctx.output?.info(`   Errors: ${trace.errors}`);
        }
      }
      return;
    }

    // Export mode
    if (result.mode === 'export') {
      ctx.output?.info(`Trace exported to: ${result.exportPath ?? 'unknown'}`);
      ctx.output?.info('Open in Chrome DevTools: chrome://tracing -> Load');
      return;
    }

    // Show mode
    if (result.mode === 'show' && result.flamegraph) {
      ctx.output?.info(result.flamegraph);
    }
  },
});

