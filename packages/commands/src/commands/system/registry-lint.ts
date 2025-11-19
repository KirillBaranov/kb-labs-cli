/**
 * registry:lint command — validate manifest header policies
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { createCliAPI } from '@kb-labs/cli-api';
import { resolveHeaderPolicy } from '@kb-labs/plugin-adapter-rest';
import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';

type LintLevel = 'error' | 'warn';

interface LintIssue {
  level: LintLevel;
  pluginId: string;
  routeId: string;
  header?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

type RegistryLintResult = CommandResult & {
  errors?: LintIssue[];
  warnings?: LintIssue[];
  issues?: LintIssue[];
  summary?: {
    manifests: number;
    errors: number;
    warnings: number;
  };
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'http2-settings',
]);

const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);

const WILDCARD_PATTERNS = [/^\*$/, /^\.\*$/, /^.*$/, /^\^?\.\*\$?$/];

const MAX_RULES_THRESHOLD = 64;

export const registryLint = defineSystemCommand<RegistryLintFlags, RegistryLintResult>({
  name: 'registry:lint',
  description: 'Validate header policies declared in REST plugin manifests',
  category: 'system',
  examples: ['kb registry:lint', 'kb registry:lint --json', 'kb registry:lint --strict'],
  flags: {
    json: { type: 'boolean', description: 'Output JSON report' },
    strict: { type: 'boolean', description: 'Treat warnings as failures (exit 1 on warnings)' },
  },
  analytics: {
    command: 'registry:lint',
    startEvent: 'REGISTRY_LINT_STARTED',
    finishEvent: 'REGISTRY_LINT_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const strictMode = flags.strict; // Type-safe: boolean
    const cliApi = await createCliAPI({
      cache: { inMemory: true, ttlMs: 10_000 },
    });

    try {
      const snapshot = cliApi.snapshot();
      const issues: LintIssue[] = [];

      for (const entry of snapshot.manifests) {
        const manifest = entry.manifest;
        if (!manifest?.rest?.routes) {
          continue;
        }
        issues.push(...lintManifest(manifest));
      }

      const errors = issues.filter((issue) => issue.level === 'error');
      const warnings = issues.filter((issue) => issue.level === 'warn');

      ctx.logger?.info('Registry lint completed', {
        manifests: snapshot.manifests.length,
        errors: errors.length,
        warnings: warnings.length,
      });

      return {
        ok: errors.length === 0 && (!strictMode || warnings.length === 0),
        errors,
        warnings,
        issues,
        summary: {
          manifests: snapshot.manifests.length,
          errors: errors.length,
          warnings: warnings.length,
        },
      };
    } finally {
      await cliApi.dispose();
    }
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json({
        ok: result.ok,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary,
      });
      return;
    }

    if (!ctx.output) {
      throw new Error('Output not available');
    }

    const issues = result.issues ?? [];
    const errors = result.errors ?? [];
    const warnings = result.warnings ?? [];

    if (issues.length === 0) {
      ctx.output.info('✅ Header policies look good (no issues found).');
    } else {
      const grouped = groupIssues(issues);
      for (const [pluginId, pluginIssues] of grouped) {
        ctx.output.info(`\n${pluginId}:`);
        for (const issue of pluginIssues) {
          const prefix = issue.level === 'error' ? '❌' : '⚠️';
          const headerInfo = issue.header ? ` [${issue.header}]` : '';
          ctx.output.info(`  ${prefix} ${issue.code}${headerInfo} (${issue.routeId}) — ${issue.message}`);
          if (issue.details && Object.keys(issue.details).length > 0) {
            ctx.output.info(`      details: ${JSON.stringify(issue.details)}`);
          }
        }
      }
      ctx.output.info(
        `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s) across ${result.summary?.manifests ?? 0} plugin(s).`,
      );
    }
  },
});

function lintManifest(manifest: ManifestV2): LintIssue[] {
  const issues: LintIssue[] = [];
  const basePath = manifest.rest?.basePath || `/v1/plugins/${manifest.id}`;

  for (const route of manifest.rest?.routes ?? []) {
    const policy = resolveHeaderPolicy(manifest, route, basePath);
    if (!policy) {
      continue;
    }

    const routeId = `${route.method} ${route.path}`;

    // Allow/deny list checks
    for (const name of policy.allowList ?? []) {
      const lowered = normalize(name);
      if (HOP_BY_HOP_HEADERS.has(lowered)) {
        issues.push(
          lintIssue('error', manifest.id, routeId, headerCase(lowered), 'HOP_BY_HOP_ALLOWED', {
            message: `Hop-by-hop header "${headerCase(lowered)}" must not be allowed.`,
            list: 'allowList',
          })
        );
      }
    }

    for (const rule of policy.inbound) {
      const ruleIssues = lintRule(manifest.id, route, rule, 'inbound');
      issues.push(...ruleIssues);
    }

    for (const rule of policy.outbound) {
      const ruleIssues = lintRule(manifest.id, route, rule, 'outbound');
      issues.push(...ruleIssues);
    }

    if ((policy.inbound?.length ?? 0) + (policy.outbound?.length ?? 0) > MAX_RULES_THRESHOLD) {
      issues.push(
        lintIssue('warn', manifest.id, routeId, undefined, 'RULE_OVERFLOW', {
          message: `Policy defines more than ${MAX_RULES_THRESHOLD} rules; consider splitting or simplifying.`,
        })
      );
    }

    if (
      policy.allowList?.some((value) => isWildcardString(value)) ||
      policy.inbound?.some((rule) => isWildcardRule(rule)) ||
      policy.outbound?.some((rule) => isWildcardRule(rule))
    ) {
      issues.push(
        lintIssue('warn', manifest.id, routeId, undefined, 'WILDCARD_RULE', {
          message:
            'Wildcard header rules detected; ensure this is intentional and documented.',
        })
      );
    }
  }

  return issues;
}

function lintRule(
  pluginId: string,
  route: RestRouteDecl,
  rule: any,
  direction: 'inbound' | 'outbound'
): LintIssue[] {
  const issues: LintIssue[] = [];
  const routeId = `${route.method} ${route.path}`;

  if (rule.match?.kind !== 'exact') {
    return issues;
  }

  const header = normalize(rule.match.name);

  if (HOP_BY_HOP_HEADERS.has(header)) {
    issues.push(
      lintIssue('error', pluginId, routeId, headerCase(header), 'HOP_BY_HOP_RULE', {
        message: `Hop-by-hop header "${headerCase(header)}" cannot be ${direction}.`,
        action: rule.action,
      })
    );
  }

  if (SENSITIVE_HEADERS.has(header) && !rule.sensitive) {
    issues.push(
      lintIssue('error', pluginId, routeId, headerCase(header), 'SENSITIVE_NOT_MARKED', {
        message: `Sensitive header "${headerCase(header)}" must set sensitive: true.`,
      })
    );
  }

  if (rule.sensitive && rule.redactInErrors === false) {
    issues.push(
      lintIssue('warn', pluginId, routeId, headerCase(header), 'SENSITIVE_LOGGING_ENABLED', {
        message: `Sensitive header "${headerCase(header)}" has redactInErrors: false.`,
      })
    );
  }

  if (direction === 'outbound' && header === 'set-cookie' && rule.action !== 'strip') {
    issues.push(
      lintIssue('warn', pluginId, routeId, headerCase(header), 'SET_COOKIE_FORWARD', {
        message: 'Forwarding Set-Cookie requires strict review; prefer strip unless absolutely needed.',
      })
    );
  }

  return issues;
}

function lintIssue(
  level: LintLevel,
  pluginId: string,
  routeId: string,
  header: string | undefined,
  code: string,
  info: { message: string; [key: string]: unknown }
): LintIssue {
  const { message, ...details } = info;
  return {
    level,
    pluginId,
    routeId,
    header,
    code,
    message,
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

function groupIssues(issues: LintIssue[]): Map<string, LintIssue[]> {
  const map = new Map<string, LintIssue[]>();
  for (const issue of issues) {
    if (!map.has(issue.pluginId)) {
      map.set(issue.pluginId, []);
    }
    map.get(issue.pluginId)!.push(issue);
  }
  return map;
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function headerCase(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function isWildcardString(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '*' || trimmed === '';
}

function isWildcardRule(rule: any): boolean {
  if (!rule?.match) {
    return false;
  }
  const match = rule.match;
  if (match.kind === 'prefix') {
    return !match.prefix || match.prefix === '*';
  }
  if (match.kind === 'regex') {
    return WILDCARD_PATTERNS.some((regex) => regex.test(match.pattern));
  }
  return false;
}

