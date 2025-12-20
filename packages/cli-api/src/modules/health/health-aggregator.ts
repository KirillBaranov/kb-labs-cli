/**
 * @module @kb-labs/cli-api/modules/health/health-aggregator
 * Health snapshot aggregation logic.
 */

import { normalize, resolve } from 'node:path';

import type { PluginBrief } from '@kb-labs/cli-core';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

import type { RegistrySnapshot, RegistrySnapshotManifestEntry } from '../snapshot/types.js';
import type { GitInfo, SystemHealthSnapshot, SystemHealthOptions } from './types.js';
import { getGitInfo } from './git-info.js';

/**
 * Registry error entry.
 */
export interface RegistryError {
  path: string;
  error: string;
}

/**
 * Health aggregator dependencies.
 */
export interface HealthAggregatorDeps {
  /** Get current registry snapshot */
  getSnapshot: () => RegistrySnapshot;
  /** List all plugins */
  listPlugins: () => Promise<PluginBrief[]>;
  /** Get registry errors (producer mode only) */
  getRegistryErrors: () => RegistryError[];
  /** Get manifest for a plugin */
  getManifest: (pluginId: string) => ManifestV3 | undefined;
  /** Get manifest entry from snapshot (consumer mode) */
  getSnapshotManifestEntry: (pluginId: string) => RegistrySnapshotManifestEntry | undefined;
  /** Check if registry is initialized */
  isRegistryInitialized: () => boolean;
  /** API mode (producer/consumer) */
  mode: 'producer' | 'consumer';
  /** Discovery roots for git info */
  discoveryRoots?: string[];
  /** CLI version string */
  cliVersion: string;
}

/**
 * Health aggregator options.
 */
export interface HealthAggregatorOptions {
  deps: HealthAggregatorDeps;
}

/**
 * Aggregates system health from registry and plugins.
 */
export class HealthAggregator {
  private readonly deps: HealthAggregatorDeps;

  constructor(options: HealthAggregatorOptions) {
    this.deps = options.deps;
  }

  /**
   * Generate a system health snapshot.
   */
  async getSystemHealth(options?: SystemHealthOptions): Promise<SystemHealthSnapshot> {
    const now = new Date();
    const uptimeSec = coerceUptime(options?.uptimeSec);
    const registrySnapshot = this.deps.getSnapshot();
    const plugins = await this.deps.listPlugins();
    const gitInfo = getGitInfo(this.deps.discoveryRoots);
    const version = buildVersionInfo(options?.version, gitInfo, this.deps.cliVersion);

    let withRest = 0;
    let withStudio = 0;

    const pluginErrors =
      this.deps.mode === 'consumer'
        ? new Map<string, string>()
        : mapErrorsToPlugins(plugins, this.deps.getRegistryErrors());

    const unmatchedErrors =
      this.deps.mode === 'consumer'
        ? []
        : collectUnmatchedErrors(plugins, this.deps.getRegistryErrors());

    const components = plugins.map((plugin) => {
      const manifest =
        this.deps.mode === 'consumer'
          ? this.deps.getSnapshotManifestEntry(plugin.id)?.manifest
          : this.deps.getManifest(plugin.id);

      const restRoutes = manifest?.rest?.routes?.length ?? 0;
      const studioWidgets = manifest?.studio?.widgets?.length ?? 0;

      if (restRoutes > 0) {
        withRest += 1;
      }
      if (studioWidgets > 0) {
        withStudio += 1;
      }

      const lastError = pluginErrors.get(plugin.id);

      return {
        id: plugin.id,
        version: plugin.version,
        restRoutes,
        studioWidgets,
        ...(lastError ? { lastError } : {}),
      };
    });

    const registryErrors = this.deps.mode === 'consumer' ? 0 : this.deps.getRegistryErrors().length;
    const degraded =
      registryErrors > 0 ||
      registrySnapshot.partial ||
      registrySnapshot.stale ||
      components.some((component) => Boolean(component.lastError));

    const initialized =
      this.deps.mode === 'consumer'
        ? registrySnapshot.partial === false
        : this.deps.isRegistryInitialized();

    const meta = mergeMeta(options?.meta, unmatchedErrors, initialized, registrySnapshot);

    return {
      schema: 'kb.health/1',
      ts: now.toISOString(),
      uptimeSec,
      version,
      registry: {
        total: plugins.length,
        withRest,
        withStudio,
        errors: registryErrors,
        generatedAt: registrySnapshot.generatedAt,
        expiresAt: registrySnapshot.expiresAt,
        partial: registrySnapshot.partial,
        stale: registrySnapshot.stale,
      },
      status: degraded ? 'degraded' : 'healthy',
      components,
      ...(meta ? { meta } : {}),
    };
  }
}

/**
 * Coerce uptime value to a valid integer.
 */
function coerceUptime(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return Math.max(0, Math.floor(process.uptime()));
}

/**
 * Build version info for health snapshot.
 */
function buildVersionInfo(
  overrides: SystemHealthOptions['version'],
  gitInfo: GitInfo | undefined,
  cliVersion: string
): SystemHealthSnapshot['version'] {
  const base: SystemHealthSnapshot['version'] = {
    kbLabs: process.env.KB_LABS_VERSION || process.env.KB_VERSION || cliVersion,
    cli: cliVersion,
    rest: process.env.KB_REST_VERSION || 'unknown',
    studio: process.env.KB_STUDIO_VERSION,
  };

  const merged: SystemHealthSnapshot['version'] = {
    ...base,
    ...overrides,
  };

  if (!merged.git && gitInfo) {
    merged.git = gitInfo;
  }

  return merged;
}

/**
 * Map registry errors to their respective plugins.
 */
function mapErrorsToPlugins(
  plugins: PluginBrief[],
  errors: RegistryError[]
): Map<string, string> {
  const sourceMap = new Map<string, string>();
  for (const plugin of plugins) {
    const normalizedPath = safeNormalize(plugin.source.path);
    sourceMap.set(normalizedPath, plugin.id);
  }

  const pluginErrors = new Map<string, string>();
  for (const entry of errors) {
    const normalizedPath = safeNormalize(entry.path);
    const pluginId = sourceMap.get(normalizedPath);
    if (pluginId) {
      pluginErrors.set(pluginId, sanitizeError(entry.error));
    }
  }

  return pluginErrors;
}

/**
 * Collect errors that don't match any known plugin.
 */
function collectUnmatchedErrors(
  plugins: PluginBrief[],
  errors: RegistryError[]
): string[] {
  const matchedPaths = new Set<string>();
  const sourcePaths = new Set<string>();

  for (const plugin of plugins) {
    sourcePaths.add(safeNormalize(plugin.source.path));
  }

  for (const entry of errors) {
    const normalizedPath = safeNormalize(entry.path);
    if (sourcePaths.has(normalizedPath)) {
      matchedPaths.add(normalizedPath);
    }
  }

  const unmatched: string[] = [];
  for (const entry of errors) {
    const normalizedPath = safeNormalize(entry.path);
    if (!matchedPaths.has(normalizedPath)) {
      unmatched.push(sanitizeError(entry.error));
    }
  }

  return unmatched;
}

/**
 * Sanitize error message for display.
 */
function sanitizeError(message: string): string {
  if (!message) {
    return 'unknown_error';
  }
  const trimmed = message.trim().split('\n')[0] ?? message.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

/**
 * Normalize file path safely.
 */
function safeNormalize(filePath: string): string {
  try {
    return normalize(resolve(filePath));
  } catch {
    return filePath;
  }
}

/**
 * Merge meta information for health snapshot.
 */
function mergeMeta(
  meta: SystemHealthOptions['meta'],
  unmatchedErrors: string[],
  initialized: boolean,
  snapshot: RegistrySnapshot
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(meta || {}) };

  if (merged.registryInitialized === undefined) {
    merged.registryInitialized = initialized;
  } else if (!initialized) {
    merged.registryInitialized = false;
  }

  if (unmatchedErrors.length > 0) {
    merged.orphanErrors = unmatchedErrors;
  }

  merged.registryRev = snapshot.rev;
  merged.registrySource = snapshot.source;
  merged.registryPartial = snapshot.partial;
  merged.registryStale = snapshot.stale;
  if (snapshot.corrupted) {
    merged.registryCorrupted = true;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}
