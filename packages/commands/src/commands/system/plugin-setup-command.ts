/**
 * @kb-labs/cli-commands/system
 * Plugin setup orchestrator for ManifestV2 setup handlers.
 */

import { getContextCwd } from '@kb-labs/shared-cli-ui';
import {
  execute,
  createId,
  createPluginContext,
  getTrackedOperations,
  OperationTracker,
} from '@kb-labs/plugin-runtime';
import {
  createAnalyzer as createSetupAnalyzer,
  createPlanner as createSetupPlanner,
  createExecutor as createSetupExecutor,
  createChangeJournal as createSetupJournal,
  createOperationRegistry,
} from '@kb-labs/setup-engine';
import type {
  ManifestV2,
  PermissionSpec,
} from '@kb-labs/plugin-manifest';
import {
  readWorkspaceConfig,
  writeFileAtomic,
} from '@kb-labs/core-config';
import {
  ADAPTER_TYPES,
  CURRENT_CONTEXT_VERSION,
  validateAdapterMetadata,
} from '@kb-labs/core-sandbox';
import type { AdapterMetadata } from '@kb-labs/core-sandbox';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type {
  PresenterFacade,
  PresenterProgressPayload,
  PresenterMessageOptions,
} from '@kb-labs/plugin-runtime';
import type { OperationWithMetadata } from '@kb-labs/setup-operations';
import { renderSetupDiff } from '../../utils/render-diff';
import type { Command } from '../../types/index';

type SetupHandlerResult = {
  configDefaults?: Record<string, unknown>;
  suggestions?: {
    scripts?: Record<string, string>;
    gitignore?: string[];
    hooks?: Record<string, string>;
    notes?: string[];
  };
  operations?: OperationWithMetadata[];
  message?: string;
};

interface PluginSetupCommandFactoryOptions {
  manifest: ManifestV2;
  namespace: string;
  packageName: string;
  pkgRoot: string;
}

const SAFE_PROJECT_PATTERNS = new Set([
  '.gitignore',
  '.env.example',
  '.env.local.example',
]);

const SYSTEM_DENY_PATTERNS = [
  '.kb/plugins.json',
  '.kb/kb-labs.config.json',
  '.kb/cache/**',
  '.kb/*/.*',
  'node_modules/**',
  '.git/objects/**',
  '.git/refs/**',
  '.git/index',
  '.git/config',
] as const;

const DEFAULT_CONFIG_PATH = path.join('.kb', 'kb-labs.config.json');

const COMMAND_FLAGS = [
  {
    name: 'force',
    type: 'boolean' as const,
    description: 'Overwrite existing configuration and files.',
  },
  {
    name: 'dry-run',
    type: 'boolean' as const,
    description: 'Preview setup changes without writing to disk.',
  },
  {
    name: 'yes',
    type: 'boolean' as const,
    description: 'Auto-confirm modifications outside the .kb/ directory.',
  },
  {
    name: 'kb-only',
    type: 'boolean' as const,
    description: 'Restrict setup to .kb/ paths and skip project files.',
  },
];

function toBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return Boolean(value);
}

function getFlagValue(
  flags: Record<string, unknown>,
  name: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(flags, name)) {
    return flags[name];
  }
  const camelCased = name.replace(/-([a-z])/gi, (_, letter: string) =>
    letter.toUpperCase(),
  );
  if (Object.prototype.hasOwnProperty.call(flags, camelCased)) {
    return flags[camelCased];
  }
  return undefined;
}

class SetupPresenterFacade implements PresenterFacade {
  constructor(
    private readonly presenter: any,
    private readonly output?: any,
    private readonly logger?: any
  ) {}

  message(text: string, options?: PresenterMessageOptions): void {
    const level = options?.level ?? 'info';
    const meta = options?.meta;
    
    // Use output if available, fallback to presenter
    if (this.output) {
      switch (level) {
        case 'error':
          this.output.error?.(new Error(text));
          break;
        case 'warn':
          this.output.warn?.(text);
          break;
        case 'debug':
          this.output.debug?.(text, meta);
          break;
        default:
          this.output.info?.(text, meta);
          break;
      }
    } else {
      // Fallback to presenter
      switch (level) {
        case 'error':
          this.presenter?.error?.(text) ?? this.presenter?.write?.(text);
          break;
        case 'warn':
          this.presenter?.warn?.(text) ?? this.presenter?.write?.(text);
          break;
        case 'debug':
          this.presenter?.write?.(text);
          break;
        default:
          this.presenter?.info?.(text) ?? this.presenter?.write?.(text);
          break;
      }
    }

    if (meta && Object.keys(meta).length > 0) {
      this.logger?.debug('Setup message meta', meta);
      const serialized = safeSerialize(meta);
      if (serialized && this.output) {
        this.output.debug?.(serialized);
      } else if (serialized) {
        this.presenter?.write?.(serialized);
      }
    }
  }

  progress(update: PresenterProgressPayload): void {
    const status = update.status ? `[${update.status}]` : '';
    const percent =
      typeof update.percent === 'number'
        ? ` ${update.percent.toFixed(
            Number.isInteger(update.percent) ? 0 : 1,
          )}%`
        : '';
    const message = update.message ? ` - ${update.message}` : '';
    const line = `${update.stage}${status}${percent}${message}`;
    
    if (this.output) {
      this.output.progress?.(update.stage, { message: update.message, current: update.percent });
    } else {
      this.presenter?.info?.(line) ?? this.presenter?.write?.(line);
    }
  }

  json(data: unknown): void {
    if (this.output) {
      this.output.json?.(data);
    } else {
      this.presenter?.json?.(data);
    }
  }

  error(error: unknown, meta?: Record<string, unknown>): void {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    
    if (this.output) {
      this.output.error?.(error instanceof Error ? error : new Error(message));
      if (meta && Object.keys(meta).length > 0) {
        this.logger?.error('Setup error meta', meta);
      }
    } else {
      this.presenter?.error?.(message) ?? this.presenter?.write?.(message);
      if (meta && Object.keys(meta).length > 0) {
        const serialized = safeSerialize(meta);
        if (serialized) {
          this.presenter?.error?.(serialized);
        }
      }
    }
  }
}

function safeSerialize(payload: Record<string, unknown>): string | null {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return null;
  }
}

function parseHandlerRef(handlerRef: string): { file: string; export: string } {
  const [file, exportName] = handlerRef.split('#');
  if (!file || !exportName) {
    throw new Error(
      `setup.handler must include export name (e.g., "./setup.js#run"), got "${handlerRef}"`,
    );
  }
  return { file, export: exportName };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cloneJson<T>(value: T): T {
  return value === undefined
    ? value
    : JSON.parse(JSON.stringify(value)) as T;
}

function mergeDefaults(
  existing: Record<string, unknown> | undefined,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const target: Record<string, unknown> = existing
    ? cloneJson(existing)
    : {};

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = value;
      continue;
    }

    const current = target[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      target[key] = mergeDefaults(current, value);
    }
  }

  return target;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function confirmDangerousWrite(patterns: string[]): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output, terminal: true });
  try {
    const answer = await rl.question(
      `Continue with modifications outside .kb/ (${patterns.join(', ')})? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    await rl.close();
  }
}

function derivePluginConfigKey(manifest: ManifestV2, namespace: string): string {
  const explicitId =
    manifest.id?.includes('/')
      ? manifest.id.split('/')[1]
      : manifest.id;
  return explicitId?.replace(/^[^a-z0-9]+/i, '') || namespace;
}

function buildEffectivePermissions(
  original: PermissionSpec,
  { kbOnly }: { kbOnly: boolean },
): PermissionSpec {
  const clone = cloneJson(original) as PermissionSpec;

  if (!clone.fs) {
    clone.fs = { mode: 'readWrite', allow: [] };
  } else {
    clone.fs = {
      ...clone.fs,
      allow: clone.fs.allow ? [...clone.fs.allow] : [],
      deny: clone.fs.deny ? [...clone.fs.deny] : undefined,
    };
  }

  const fsPerms = clone.fs;
  if (!fsPerms.allow) {
    fsPerms.allow = [];
  }

  if (kbOnly) {
    fsPerms.allow = fsPerms.allow.filter((pattern) =>
      pattern.startsWith('.kb/'),
    );
  }

  if (fsPerms.allow.length === 0) {
    fsPerms.allow = ['.kb/**'];
  }

  const deny = new Set(fsPerms.deny ?? []);
  for (const pattern of SYSTEM_DENY_PATTERNS) {
    deny.add(pattern);
  }
  fsPerms.deny = Array.from(deny).filter(Boolean) as string[];

  return clone;
}

function getDangerousPatterns(allow: string[] | undefined): string[] {
  if (!allow) {
    return [];
  }
  return allow.filter(
    (pattern) =>
      !pattern.startsWith('.kb/') && !SAFE_PROJECT_PATTERNS.has(pattern),
  );
}

async function writeSetupMarker(
  cwd: string,
  namespace: string,
  dryRun: boolean,
  output: any,
) {
  const markerDir = path.join(cwd, '.kb', namespace);
  const markerPath = path.join(markerDir, '.setup-complete');
  if (dryRun) {
    output?.info?.(
      `[dry-run] Would write setup marker: ${path.relative(cwd, markerPath)}`,
    );
    return;
  }

  await fs.mkdir(markerDir, { recursive: true });
  await fs.writeFile(markerPath, new Date().toISOString(), 'utf8');
  output?.info?.(`✓ Setup marker written: ${path.relative(cwd, markerPath)}`);
}

async function updateConfigFile(options: {
  cwd: string;
  namespace: string;
  manifest: ManifestV2;
  configDefaults?: Record<string, unknown>;
  force: boolean;
  dryRun: boolean;
  presenter: any;
  output?: any;
  logger?: any;
}): Promise<void> {
  const { cwd, namespace, manifest, configDefaults, force, dryRun, presenter, output, logger } =
    options;
  if (!configDefaults || Object.keys(configDefaults).length === 0) {
    return;
  }

  const configResult = await readWorkspaceConfig(cwd);
  const configPath = configResult?.path ?? path.join(cwd, DEFAULT_CONFIG_PATH);
  const existingData = (configResult?.data ?? {}) as Record<string, unknown>;

  if (!isPlainObject(existingData)) {
    throw new Error(
      `Existing workspace config (${configPath}) is not a JSON object.`,
    );
  }

  if (!existingData.schemaVersion) {
    existingData.schemaVersion = '1.0';
  }

  if (!isPlainObject(existingData.plugins)) {
    existingData.plugins = {};
  }

  const plugins = existingData.plugins as Record<string, unknown>;
  const configKey = derivePluginConfigKey(manifest, namespace);
  const currentPluginConfig = plugins[configKey] as
    | Record<string, unknown>
    | undefined;

  const nextPluginConfig = force
    ? cloneJson(configDefaults)
    : mergeDefaults(currentPluginConfig, configDefaults);

  if (currentPluginConfig && deepEqual(currentPluginConfig, nextPluginConfig)) {
    (output || presenter)?.info?.(
      `Config already up to date for plugins.${configKey}, nothing to change.`,
    );
    logger?.debug('Config already up to date', { configKey });
    return;
  }

  const updatedConfig = {
    ...existingData,
    plugins: {
      ...plugins,
      [configKey]: nextPluginConfig,
    },
  };

  const serialized = JSON.stringify(updatedConfig, null, 2) + '\n';
  if (dryRun) {
    (output || presenter)?.info?.(
      `[dry-run] Would update ${path.relative(cwd, configPath)} (plugins.${configKey})`,
    );
    return;
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await writeFileAtomic(configPath, serialized);
  (output || presenter)?.info?.(
    `✓ Updated config: ${path.relative(cwd, configPath)} (plugins.${configKey})`,
  );
  logger?.info('Config updated', { configPath, configKey });
}

function printSuggestions(
  output: any,
  suggestions: SetupHandlerResult['suggestions'],
) {
  if (!suggestions) {
    return;
  }

  if (suggestions.scripts && Object.keys(suggestions.scripts).length > 0) {
    output?.info?.('\n💡 Suggested package.json scripts:');
    for (const [name, command] of Object.entries(suggestions.scripts)) {
      output?.info?.(`  "${name}": "${command}"`);
    }
  }

  if (suggestions.gitignore && suggestions.gitignore.length > 0) {
    output?.info?.('\n💡 Add to .gitignore:');
    for (const pattern of suggestions.gitignore) {
      output?.info?.(`  ${pattern}`);
    }
  }

  if (suggestions.hooks && Object.keys(suggestions.hooks).length > 0) {
    output?.info?.('\n💡 Recommended git hooks:');
    for (const [hook, command] of Object.entries(suggestions.hooks)) {
      output?.info?.(`  ${hook}: ${command}`);
    }
  }

  if (suggestions.notes && suggestions.notes.length > 0) {
    output?.info?.('\nℹ️  Additional notes:');
    for (const note of suggestions.notes) {
      output?.info?.(`  ${note}`);
    }
  }
}

function mergeOperations(
  primary: OperationWithMetadata[] | undefined,
  secondary: OperationWithMetadata[]
): OperationWithMetadata[] {
  const result: OperationWithMetadata[] = [];
  const seen = new Set<string>();

  const append = (operations?: OperationWithMetadata[]) => {
    if (!operations) return;
    for (const operation of operations) {
      if (seen.has(operation.metadata.id)) {
        continue;
      }
      seen.add(operation.metadata.id);
      result.push(operation);
    }
  };

  append(primary);
  append(secondary);

  return result;
}

export function createPluginSetupCommand(
  options: PluginSetupCommandFactoryOptions
): Command {
  const { manifest, namespace, packageName, pkgRoot } = options;

  if (!manifest.setup) {
    throw new Error(
      `Manifest ${manifest.id || packageName} does not declare a setup handler.`
    );
  }

  const commandName = `${namespace}:setup`;
  const describe =
    manifest.setup.describe ||
    `Initialize ${manifest.display?.name || manifest.id || namespace}`;

  return {
    name: commandName,
    describe,
    category: namespace,
    examples: [
      `kb ${namespace} setup`,
      `kb ${namespace} setup --dry-run`,
    ],
    flags: COMMAND_FLAGS,
    async run(ctx, argv, rawFlags): Promise<number> {
      const cliPresenter = ctx.presenter ?? {};
      const setupPresenter = new SetupPresenterFacade(cliPresenter, ctx.output, ctx.logger);
      const cwd = getContextCwd(ctx) ?? process.cwd();
      
      ctx.logger?.info('Plugin setup started', { 
        namespace, 
        packageName, 
        commandName,
        dryRun: toBooleanFlag(getFlagValue(rawFlags, 'dry-run')),
        force: toBooleanFlag(rawFlags.force),
      });

      const applyDryRun = toBooleanFlag(getFlagValue(rawFlags, 'dry-run'));
      const force = toBooleanFlag(rawFlags.force);
      const autoConfirm = toBooleanFlag(rawFlags.yes);
      const kbOnly = toBooleanFlag(getFlagValue(rawFlags, 'kb-only'));

      try {
        const requestId = createId();
        const traceId = createId();

        const effectivePermissions = buildEffectivePermissions(
          manifest.setup.permissions || { fs: { mode: 'readWrite', allow: [] } },
          { kbOnly }
        );

        const dangerousPatterns = getDangerousPatterns(effectivePermissions.fs?.allow);
        if (!applyDryRun && dangerousPatterns.length > 0 && !autoConfirm) {
          ctx.output?.warn?.(`Setup will modify files outside .kb/: ${dangerousPatterns.join(', ')}`);
          ctx.logger?.warn('Dangerous patterns detected', { patterns: dangerousPatterns });
          const confirmed = await confirmDangerousWrite(dangerousPatterns);
          if (!confirmed) {
            ctx.output?.warn?.('Setup aborted by user.');
            ctx.logger?.info('Setup aborted by user');
            return 1;
          }
        }

        const operationTracker = new OperationTracker();
        const pluginContext = createPluginContext('cli', {
          requestId,
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          presenter: setupPresenter,
          metadata: {
            namespace,
            packageName,
            cwd,
            flags: rawFlags,
          },
          getTrackedOperations: () => operationTracker.toArray(),
        });

        const executionContext: any = {
          requestId,
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          routeOrCommand: commandName,
          workdir: cwd,
          outdir: path.join(cwd, '.kb', 'tmp', `${namespace}-setup`),
          pluginRoot: pkgRoot,
          pluginContext,
          version: CURRENT_CONTEXT_VERSION,
          traceId,
          dryRun: true,
          jsonMode: false,
          tmpFiles: [],
          operationTracker,
        } satisfies Record<string, unknown>;

        const adapterMeta: AdapterMetadata = {
          type: ADAPTER_TYPES.CLI,
          signature: 'setup',
          version: '1.0.0',
          meta: {
            namespace,
            packageName,
          },
        };
        validateAdapterMetadata(adapterMeta);
        executionContext.adapterMeta = adapterMeta;
        executionContext.adapterContext = {
          type: 'cli-setup',
          presenter: ctx.presenter,
          cwd,
          flags: rawFlags,
          argv,
          requestId,
          workdir: executionContext.workdir,
          outdir: executionContext.outdir,
          pluginId: executionContext.pluginId,
          pluginVersion: executionContext.pluginVersion,
          traceId,
          spanId: executionContext.spanId,
          parentSpanId: executionContext.parentSpanId,
          debug: executionContext.debug,
        };

        const handlerRef = parseHandlerRef(manifest.setup.handler);

        const executeResult = await execute(
          {
            handler: handlerRef,
            input: { flags: rawFlags },
            manifest,
            perms: effectivePermissions,
          },
          executionContext
        );

        if (!executeResult.ok) {
          ctx.logger?.error('Setup execution failed', { error: executeResult.error });
          ctx.output?.error?.(executeResult.error instanceof Error ? executeResult.error : new Error(String(executeResult.error)));
          return 1;
        }

        const payload = executeResult.data as SetupHandlerResult;

        const trackedOperations = getTrackedOperations(executionContext);
        const operations = mergeOperations(payload.operations, trackedOperations);

        const operationRegistry = createOperationRegistry();

        const analyzer = createSetupAnalyzer({
          workspaceRoot: cwd,
          registry: operationRegistry,
        });
        const analysis = await analyzer.analyzeAll(operations);
        const planner = createSetupPlanner({
          registry: operationRegistry,
          workspaceRoot: cwd,
        });
        const plan = planner.plan(operations, analysis);

        const diffLines = renderSetupDiff(plan);
        for (const line of diffLines) {
          ctx.output?.info?.(line);
        }
        ctx.logger?.info('Setup plan generated', { operationsCount: plan.length });

        const executor = createSetupExecutor({
          workspaceRoot: cwd,
          registry: operationRegistry,
        });
        const journal = createSetupJournal({
          workspaceRoot: cwd,
          logPath: path.join(
            cwd,
            '.kb',
            'logs',
            'setup',
            `${namespace}-${requestId}.json`
          ),
        });

        const executionResult = await executor.execute(plan, {
          dryRun: applyDryRun,
          autoConfirm,
          backupDir: path.join(cwd, '.kb', 'logs', 'setup'),
          journal,
          onProgress: (event) => {
            ctx.output?.info?.(
              `[${event.stageId}] ${event.status.toUpperCase()} ${event.operation.metadata.description}`
            );
            ctx.logger?.debug('Setup progress', { 
              stageId: event.stageId, 
              status: event.status,
              operation: event.operation.metadata.id,
            });
          },
        });

        if (!executionResult.success) {
          ctx.logger?.error('Setup operations failed', { 
            journalPath: journal.getLogPath(),
          });
          ctx.output?.error?.(new Error('Setup operations failed to apply. See logs for details.'));
          return 1;
        }
        
        ctx.logger?.info('Setup operations completed successfully', {
          operationsCount: plan.length,
          journalPath: journal.getLogPath(),
        });

        await updateConfigFile({
          cwd,
          namespace,
          manifest,
          configDefaults: payload.configDefaults,
          force,
          dryRun: applyDryRun,
          presenter: cliPresenter,
          output: ctx.output,
          logger: ctx.logger,
        });

        if (!applyDryRun) {
          await writeSetupMarker(cwd, namespace, applyDryRun, ctx.output || cliPresenter);
        }

        if (payload.message) {
          ctx.output?.info?.(payload.message);
        }

        printSuggestions(ctx.output || cliPresenter, payload.suggestions);

        ctx.output?.info?.('\nSetup completed successfully.');
        if (journal.getLogPath()) {
          ctx.output?.info?.(`Change log: ${journal.getLogPath()}`);
        }
        
        ctx.logger?.info('Plugin setup completed', { namespace, packageName });

        return 0;
      } catch (error) {
        ctx.logger?.error('Plugin setup failed', { 
          namespace, 
          packageName, 
          error: error instanceof Error ? error.message : String(error),
        });
        ctx.output?.error?.(error instanceof Error ? error : new Error(String(error)));
        return 1;
      }
    },
  };
}