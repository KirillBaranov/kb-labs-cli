/**
 * headers:debug command — inspect recent header policy decisions emitted by REST API
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import { formatTable, formatRelativeTime, keyValue } from '@kb-labs/shared-cli-ui';
import type { Output } from '@kb-labs/cli-contracts';
import type { StringFlagSchema } from '@kb-labs/shared-command-kit/flags';

interface HeaderDebugEntry {
  timestamp: number;
  requestId: string;
  pluginId?: string;
  routeId?: string;
  direction: "inbound" | "outbound";
  header: string;
  allowed?: boolean;
  reason?: string;
  action?: string;
  dryRun: boolean;
}

interface HeaderDebugResponse {
  entries?: HeaderDebugEntry[];
}

type FetchFn = (input: string | URL, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const DEFAULT_BASE_URL = "http://localhost:5050/api/v1";
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

function resolveBaseUrl(flagValue: unknown): string {
  const candidates = [
    typeof flagValue === "string" ? flagValue : undefined,
    process.env.KB_HEADERS_DEBUG_URL,
    process.env.KB_REST_METRICS_URL,
    process.env.KB_REST_PUBLIC_URL,
    process.env.KB_REST_BASE_URL,
  ];

  const first = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  const chosen = (first ?? DEFAULT_BASE_URL).trim();

  if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(chosen)) {
    throw new Error(`Expected an absolute base URL, received "${chosen}". Use --base-url or KB_REST_BASE_URL.`);
  }

  return chosen.replace(/\/+$/, "");
}

function clampLimit(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(value)));
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, parsed));
    }
  }

  return 50;
}

function buildEndpoint(baseUrl: string, limit: number): URL {
  const baseWithSlash = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const endpoint = new URL("metrics/headers/debug", baseWithSlash);
  endpoint.searchParams.set("limit", String(limit));
  return endpoint;
}

function ensureFetch(): FetchFn {
  const globalFetch = (globalThis as { fetch?: FetchFn }).fetch;
  if (typeof globalFetch !== "function") {
    throw new Error("Global fetch() is not available. Upgrade to Node 18+ or polyfill fetch.");
  }
  return globalFetch;
}

function filterEntries(
  entries: HeaderDebugEntry[],
  filters: {
    plugin?: string;
    route?: string;
    direction?: "inbound" | "outbound";
    dryOnly: boolean;
    blockedOnly: boolean;
  }
): HeaderDebugEntry[] {
  return entries.filter((entry) => {
    if (filters.plugin && entry.pluginId !== filters.plugin) {
      return false;
    }
    if (filters.route && entry.routeId !== filters.route) {
      return false;
    }
    if (filters.direction && entry.direction !== filters.direction) {
      return false;
    }
    if (filters.dryOnly && !entry.dryRun) {
      return false;
    }
    if (filters.blockedOnly && entry.allowed !== false) {
      return false;
    }
    return true;
  });
}

function formatDecision(entry: HeaderDebugEntry, output?: Output): string {
  if (!output) return entry.allowed === true ? "allow" : entry.allowed === false ? "block" : entry.action ?? entry.reason ?? "unknown";
  
  if (entry.allowed === true) {
    return output.ui.colors.success("allow");
  }
  if (entry.allowed === false) {
    const tag = output.ui.colors.error("block");
    return entry.dryRun ? `${tag} ${output.ui.colors.warn("(dry-run)")}` : tag;
  }
  if (entry.action) {
    return output.ui.colors.info(entry.action);
  }
  return entry.reason ?? "unknown";
}

function formatWhen(entry: HeaderDebugEntry, nowMs: number, output?: Output): string {
  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const isoTime = new Date(timestamp).toISOString().slice(11, 19);
  const relative = formatRelativeTime(new Date(timestamp));
  const dimColor = output?.ui?.colors?.muted || ((s: string) => s);
  return `${isoTime} ${dimColor(`(${relative})`)}`;
}

function summarise(entries: HeaderDebugEntry[]) {
  const allowed = entries.filter((entry) => entry.allowed === true).length;
  const blocked = entries.filter((entry) => entry.allowed === false).length;
  const dry = entries.filter((entry) => entry.dryRun).length;

  const reasonCount = new Map<string, number>();
  for (const entry of entries) {
    if (entry.reason) {
      reasonCount.set(entry.reason, (reasonCount.get(entry.reason) ?? 0) + 1);
    }
  }

  const topReasons = Array.from(reasonCount.entries())
    .sort((left, right) => right[1]! - left[1]!)
    .slice(0, 5);

  return {
    allowed,
    blocked,
    dry,
    topReasons,
  };
}

type HeadersDebugResult = CommandResult & {
  entries?: HeaderDebugEntry[];
  summary?: {
    total: number;
    allowed: number;
    blocked: number;
    dry: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
};

type HeadersDebugFlags = {
  json: { type: 'boolean'; description?: string };
  limit: { type: 'number'; description?: string };
  'base-url': { type: 'string'; description?: string };
  plugin: { type: 'string'; description?: string };
  route: { type: 'string'; description?: string };
  direction: { type: 'string'; description?: string; choices?: readonly string[] };
  dry: { type: 'boolean'; description?: string };
  blocked: { type: 'boolean'; description?: string };
};

export const headersDebug = defineSystemCommand<HeadersDebugFlags, HeadersDebugResult>({
  name: 'headers-debug',
  description: 'Stream recent header policy decisions from the REST API debug buffer',
  category: 'registry',
  examples: generateExamples('headers-debug', 'kb', [
    { flags: {} },
    { flags: { plugin: 'payments', blocked: true } },
    { flags: { dry: true, direction: 'inbound', limit: 20 } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output raw entries in JSON' },
    limit: { type: 'number', description: 'Number of recent decisions to fetch (1-200)' },
    'base-url': { type: 'string', description: 'REST API base URL (defaults to KB_REST_BASE_URL or http://localhost:5050/api/v1)' },
    plugin: { type: 'string', description: 'Filter by plugin id' },
    route: { type: 'string', description: 'Filter by route id (e.g. GET /v1/foo)' },
    direction: { type: 'string', description: 'Filter by direction (inbound | outbound)', choices: ['inbound', 'outbound'] } as Omit<StringFlagSchema, 'name'>,
    dry: { type: 'boolean', description: 'Show only entries produced while KB_HEADERS_DEBUG=dry-run' },
    blocked: { type: 'boolean', description: 'Show only headers that were blocked by policy' },
  },
  analytics: {
    command: 'headers:debug',
    startEvent: 'HEADERS_DEBUG_STARTED',
    finishEvent: 'HEADERS_DEBUG_FINISHED',
  },
  async handler(ctx, argv, flags) {
    ctx.logger?.info('Headers debug started');

    let baseUrl: string;
    try {
      baseUrl = resolveBaseUrl(flags['base-url']); // Type-safe: string | undefined
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.error('Failed to resolve base URL', { error: message });
      throw new Error(`Failed to resolve base URL: ${message}`);
    }

    const limit = clampLimit(flags.limit); // Type-safe: number | undefined
    const filters = {
      plugin: flags.plugin && flags.plugin.trim().length > 0 ? flags.plugin.trim() : undefined, // Type-safe: string | undefined
      route: flags.route && flags.route.trim().length > 0 ? flags.route.trim() : undefined, // Type-safe: string | undefined
      direction: flags.direction === 'inbound' || flags.direction === 'outbound' ? flags.direction : undefined, // Type-safe: 'inbound' | 'outbound' | undefined
      dryOnly: Boolean(flags.dry), // Type-safe: boolean | undefined
      blockedOnly: Boolean(flags.blocked), // Type-safe: boolean | undefined
    } as const;

    const fetchFn = ensureFetch();
    const endpoint = buildEndpoint(baseUrl, limit);

    let response: Awaited<ReturnType<FetchFn>>;
    try {
      response = await fetchFn(endpoint, {
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.error('Request failed', { error: message, baseUrl });
      throw new Error(`Request failed: ${message}`);
    }

    if (!response.ok) {
      const contentType = response.headers?.get('content-type') || 'unknown';
      ctx.logger?.error('REST API error response', {
        status: response.status,
        statusText: response.statusText,
        contentType,
      });

      throw new Error(`REST API responded with ${response.status} ${response.statusText} (content-type: ${contentType}).`);
    }

    const payload = (await response.json()) as HeaderDebugResponse;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const filtered = filterEntries(entries, filters);
    const summary = summarise(filtered);

    ctx.logger?.info('Headers debug completed', {
      entriesCount: entries.length,
      filteredCount: filtered.length,
      summary,
    });

    return {
      ok: true,
      baseUrl,
      limit,
      fetched: entries.length,
      filtered: filtered.length,
      filters,
      summary: {
        allowed: summary.allowed,
        blocked: summary.blocked,
        dry: summary.dry,
        reasons: summary.topReasons,
      },
      entries: filtered,
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

    const entries = result.entries ?? [];
    const summary = result.summary ?? {};
    const filters = (result as any).filters ?? {};

    const lines: string[] = [];
    lines.push(
      ...keyValue({
        'Base URL': (result as any).baseUrl ?? 'unknown',
        Fetched: `${(result as any).fetched ?? 0}`,
        'After filters': `${(result as any).filtered ?? 0}`,
        'Dry-run hits': `${summary.dry ?? 0}`,
        Blocked: `${summary.blocked ?? 0}`,
        Allowed: `${summary.allowed ?? 0}`,
      }),
    );

    if (filters.plugin || filters.route || filters.direction || filters.dryOnly || filters.blockedOnly) {
      const filterParts = [
        filters.plugin ? `plugin=${filters.plugin}` : null,
        filters.route ? `route=${filters.route}` : null,
        filters.direction ? `direction=${filters.direction}` : null,
        filters.dryOnly ? 'dry-only' : null,
        filters.blockedOnly ? 'blocked-only' : null,
      ].filter(Boolean);
      if (filterParts.length > 0) {
        lines.push('');
        lines.push(`${ctx.output.ui.symbols.info} Filters: ${filterParts.join(', ')}`);
      }
    }

    if (summary.topReasons && summary.topReasons.length > 0) {
      lines.push('');
      lines.push(ctx.output.ui.colors.bold('Top reasons:'));
      for (const [reason, count] of summary.topReasons) {
        lines.push(`  ${ctx.output.ui.symbols.bullet} ${reason} (${count})`);
      }
    }

    if (filtered.length === 0) {
      lines.push('');
      if (resultData.fetched === 0) {
        lines.push(
          `${ctx.output.ui.symbols.warning} No header decisions captured yet. Enable KB_HEADERS_DEBUG=1 (or KB_HEADERS_DEBUG=dry-run) on the REST API node and rerun this command.`,
        );
      } else {
        lines.push(`${ctx.output.ui.symbols.warning} No entries matched the current filters.`);
      }
      const outputText = ctx.output.ui.sideBox({
        title: 'Header Policy Debug',
        sections: [{ items: lines }],
        status: 'warning',
        timing: ctx.tracker.total(),
      });
      ctx.output.write(outputText);
      return;
    }

    const now = Date.now();
    const columns = [
      { header: 'When' },
      { header: 'Plugin' },
      { header: 'Route' },
      { header: 'Dir' },
      { header: 'Header' },
      { header: 'Decision' },
      { header: 'Reason' },
    ] as const;

    const rows = filtered.map((entry: HeaderDebugEntry) => [
      formatWhen(entry, now, ctx.output),
      entry.pluginId ?? '—',
      entry.routeId ?? '—',
      entry.direction,
      entry.header,
      formatDecision(entry, ctx.output),
      entry.reason ?? entry.action ?? '—',
    ]);

    lines.push('');
    lines.push(...formatTable(columns as unknown as { header: string }[], rows));
    lines.push('');
    lines.push(
      ctx.output.ui.colors.muted(
        'Tip: switch the REST API to shadow mode with KB_HEADERS_DEBUG=dry-run to observe would-be drops without mutating traffic.',
      ),
    );

    const outputText = ctx.output.ui.sideBox({
      title: 'Header Policy Debug',
      sections: [{ items: lines }],
      status: 'info',
      timing: ctx.tracker.total(),
    });
    ctx.output.write(outputText);
  },
});


