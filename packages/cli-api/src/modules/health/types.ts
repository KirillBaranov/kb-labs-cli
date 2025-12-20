/**
 * @module @kb-labs/cli-api/modules/health/types
 * Health snapshot types.
 */

/**
 * Git information for health reporting.
 */
export interface GitInfo {
  sha: string;
  dirty: boolean;
}

/**
 * Health snapshot schema.
 */
export interface SystemHealthSnapshot {
  schema: 'kb.health/1';
  ts: string;
  uptimeSec: number;
  version: {
    kbLabs: string;
    cli: string;
    rest: string;
    studio?: string;
    git?: GitInfo;
  };
  registry: {
    total: number;
    withRest: number;
    withStudio: number;
    errors: number;
    generatedAt: string;
    expiresAt?: string;
    partial: boolean;
    stale: boolean;
  };
  status: 'healthy' | 'degraded';
  components: Array<{
    id: string;
    version?: string;
    restRoutes?: number;
    studioWidgets?: number;
    lastError?: string;
  }>;
  meta?: Record<string, unknown>;
}

/**
 * Options for generating system health snapshots.
 */
export interface SystemHealthOptions {
  uptimeSec?: number;
  version?: Partial<SystemHealthSnapshot['version']>;
  meta?: Record<string, unknown>;
}
