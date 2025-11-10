/**
 * registry:lint command — validate manifest header policies
 */

import { createCliAPI } from '@kb-labs/cli-api';
import { resolveHeaderPolicy } from '@kb-labs/plugin-adapter-rest';
import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';
import type { Command } from '../../types';

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

export const registryLint: Command = {
  name: 'registry:lint',
  category: 'system',
  describe: 'Validate header policies declared in REST plugin manifests',
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output JSON report',
    },
    {
      name: 'strict',
      type: 'boolean',
      description: 'Treat warnings as failures (exit 1 on warnings)',
    },
  ],
  examples: ['kb registry:lint', 'kb registry:lint --json', 'kb registry:lint --strict'],

  async run(ctx, _argv, flags) {
    const jsonMode = Boolean(flags?.json);
    const strictMode = Boolean(flags?.strict);
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

      if (jsonMode) {
        ctx.presenter.json({
          ok: errors.length === 0 && (!strictMode || warnings.length === 0),
          errors,
          warnings,
          summary: {
            manifests: snapshot.manifests.length,
            errors: errors.length,
            warnings: warnings.length,
          },
        });
      } else {
        if (issues.length === 0) {
          ctx.presenter.info('✅ Header policies look good (no issues found).');
        } else {
          const grouped = groupIssues(issues);
          for (const [pluginId, pluginIssues] of grouped) {
            ctx.presenter.info(`\n${pluginId}:`);
            for (const issue of pluginIssues) {
              const prefix = issue.level === 'error' ? '❌' : '⚠️';
              const headerInfo = issue.header ? ` [${issue.header}]` : '';
              ctx.presenter.info(
                `  ${prefix} ${issue.code}${headerInfo} (${issue.routeId}) — ${issue.message}`
              );
              if (issue.details && Object.keys(issue.details).length > 0) {
                ctx.presenter.info(
                  `      details: ${JSON.stringify(issue.details)}`
                );
              }
            }
          }
          ctx.presenter.info(
            `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s) across ${snapshot.manifests.length} plugin(s).`
          );
        }
      }

      if (errors.length > 0 || (strictMode && warnings.length > 0)) {
        return 1;
      }
      return 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message });
      } else {
        ctx.presenter.error(message);
      }
      return 1;
    } finally {
      await cliApi.dispose();
    }
  },
};

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

