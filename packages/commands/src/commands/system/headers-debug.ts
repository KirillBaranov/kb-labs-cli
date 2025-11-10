/**
 * headers:debug command — inspect recent header policy decisions emitted by REST API
 */

import { box, formatTable, formatRelativeTime, keyValue, safeColors, safeSymbols } from "@kb-labs/shared-cli-ui";
import type { Command } from "../../types";

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

function formatDecision(entry: HeaderDebugEntry): string {
  if (entry.allowed === true) {
    return safeColors.success("allow");
  }
  if (entry.allowed === false) {
    const tag = safeColors.error("block");
    return entry.dryRun ? `${tag} ${safeColors.warning("(dry-run)")}` : tag;
  }
  if (entry.action) {
    return safeColors.info(entry.action);
  }
  return entry.reason ?? "unknown";
}

function formatWhen(entry: HeaderDebugEntry, nowMs: number): string {
  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const isoTime = new Date(timestamp).toISOString().slice(11, 19);
  const relative = formatRelativeTime(new Date(timestamp));
  return `${isoTime} ${safeColors.dim(`(${relative})`)}`;
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

export const headersDebug: Command = {
  name: "headers:debug",
  category: "system",
  describe: "Stream recent header policy decisions from the REST API debug buffer",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output raw entries in JSON",
    },
    {
      name: "limit",
      type: "number",
      description: "Number of recent decisions to fetch (1-200)",
    },
    {
      name: "base-url",
      type: "string",
      description: "REST API base URL (defaults to KB_REST_BASE_URL or http://localhost:5050/api/v1)",
    },
    {
      name: "plugin",
      type: "string",
      description: "Filter by plugin id",
    },
    {
      name: "route",
      type: "string",
      description: "Filter by route id (e.g. GET /v1/foo)",
    },
    {
      name: "direction",
      type: "string",
      description: "Filter by direction (inbound | outbound)",
      choices: ["inbound", "outbound"],
    },
    {
      name: "dry",
      type: "boolean",
      description: "Show only entries produced while KB_HEADERS_DEBUG=dry-run",
    },
    {
      name: "blocked",
      type: "boolean",
      description: "Show only headers that were blocked by policy",
    },
  ],
  examples: [
    "kb headers:debug",
    "kb headers:debug --plugin payments --blocked",
    "kb headers:debug --dry --direction inbound --limit 20",
  ],

  async run(ctx, _argv, flags) {
    const jsonMode = Boolean(flags?.json);
    let baseUrl: string;
    try {
      baseUrl = resolveBaseUrl(flags?.["base-url"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message });
      } else {
        ctx.presenter.error(message);
      }
      return 1;
    }

    const limit = clampLimit(flags?.limit);
    const filters = {
      plugin: typeof flags?.plugin === "string" && flags.plugin.trim().length > 0 ? flags.plugin.trim() : undefined,
      route: typeof flags?.route === "string" && flags.route.trim().length > 0 ? flags.route.trim() : undefined,
      direction:
        typeof flags?.direction === "string" && (flags.direction === "inbound" || flags.direction === "outbound")
          ? flags.direction
          : undefined,
      dryOnly: Boolean(flags?.dry),
      blockedOnly: Boolean(flags?.blocked),
    } as const;

    const fetchFn = ensureFetch();
    const endpoint = buildEndpoint(baseUrl, limit);

    let response: Awaited<ReturnType<FetchFn>>;
    try {
      response = await fetchFn(endpoint, {
        headers: { accept: "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        ctx.presenter.json({
          ok: false,
          error: message,
          baseUrl,
        });
      } else {
        ctx.presenter.error(`Request failed: ${message}`);
        ctx.presenter.info(
          `Ensure the REST API is running and KB_HEADERS_DEBUG is enabled (KB_HEADERS_DEBUG=1 or KB_HEADERS_DEBUG=dry-run).`
        );
      }
      return 1;
    }

    if (!response.ok) {
      const contentType = response.headers?.get("content-type") || "unknown";
      const errorPayload = {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        contentType,
      };
      if (jsonMode) {
        ctx.presenter.json(errorPayload);
      } else {
        ctx.presenter.error(
          `REST API responded with ${response.status} ${response.statusText} (content-type: ${contentType}).`
        );
      }
      return 1;
    }

    const payload = (await response.json()) as HeaderDebugResponse;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const filtered = filterEntries(entries, filters);
    const summary = summarise(filtered);

    if (jsonMode) {
      ctx.presenter.json({
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
      });
      return 0;
    }

    const lines: string[] = [];
    lines.push(...keyValue({
      "Base URL": baseUrl,
      "Fetched": `${entries.length}`,
      "After filters": `${filtered.length}`,
      "Dry-run hits": `${summary.dry}`,
      "Blocked": `${summary.blocked}`,
      "Allowed": `${summary.allowed}`,
    }));

    if (filters.plugin || filters.route || filters.direction || filters.dryOnly || filters.blockedOnly) {
      const filterParts = [
        filters.plugin ? `plugin=${filters.plugin}` : null,
        filters.route ? `route=${filters.route}` : null,
        filters.direction ? `direction=${filters.direction}` : null,
        filters.dryOnly ? "dry-only" : null,
        filters.blockedOnly ? "blocked-only" : null,
      ].filter(Boolean);
      if (filterParts.length > 0) {
        lines.push("");
        lines.push(`${safeSymbols.info} Filters: ${filterParts.join(", ")}`);
      }
    }

    if (summary.topReasons.length > 0) {
      lines.push("");
      lines.push(safeColors.bold("Top reasons:"));
      for (const [reason, count] of summary.topReasons) {
        lines.push(`  ${safeSymbols.bullet} ${reason} (${count})`);
      }
    }

    if (filtered.length === 0) {
      lines.push("");
      if (entries.length === 0) {
        lines.push(
          `${safeSymbols.warning} No header decisions captured yet. Enable KB_HEADERS_DEBUG=1 (or KB_HEADERS_DEBUG=dry-run) on the REST API node and rerun this command.`
        );
      } else {
        lines.push(`${safeSymbols.warning} No entries matched the current filters.`);
      }
      const output = box("Header Policy Debug", lines);
      ctx.presenter.write(output);
      return 0;
    }

    const now = Date.now();
    const columns = [
      { header: "When" },
      { header: "Plugin" },
      { header: "Route" },
      { header: "Dir" },
      { header: "Header" },
      { header: "Decision" },
      { header: "Reason" },
    ] as const;

    const rows = filtered.map((entry) => [
      formatWhen(entry, now),
      entry.pluginId ?? "—",
      entry.routeId ?? "—",
      entry.direction,
      entry.header,
      formatDecision(entry),
      entry.reason ?? entry.action ?? "—",
    ]);

    lines.push("");
    lines.push(...formatTable(columns as unknown as { header: string }[], rows));
    lines.push("");
    lines.push(
      safeColors.dim("Tip: switch the REST API to shadow mode with KB_HEADERS_DEBUG=dry-run to observe would-be drops without mutating traffic.")
    );

    const output = box("Header Policy Debug", lines);
    ctx.presenter.write(output);
    return 0;
  },
};


