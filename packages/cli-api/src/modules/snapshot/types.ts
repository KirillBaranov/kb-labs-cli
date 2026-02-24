/**
 * @module @kb-labs/cli-api/modules/snapshot/types
 * Snapshot-specific types.
 */

import type { SourceKind } from '@kb-labs/cli-core';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

/**
 * Manifest headers config extracted from ManifestV3.
 */
type ManifestHeadersConfig = ManifestV3 & { headers?: unknown } extends { headers?: infer H } ? H : unknown;

/**
 * Registry manifest entry stored in snapshot.
 */
export interface RegistrySnapshotManifestEntry {
  pluginId: string;
  manifest: ManifestV3;
  pluginRoot: string;
  source: {
    kind: SourceKind;
    path: string;
  };
  headers?: ManifestHeadersConfig;
}

/**
 * Discovery error for failed plugin loads
 */
export interface DiscoveryError {
  /** Plugin path or identifier where error occurred */
  pluginPath: string;
  /** Plugin ID if it could be extracted */
  pluginId?: string;
  /** Error message */
  error: string;
  /** Error code (e.g., 'MANIFEST_NOT_FOUND', 'PARSE_ERROR', 'VALIDATION_ERROR') */
  code?: string;
}

/**
 * Registry snapshot schema exposed by CLI API.
 */
export interface RegistrySnapshot {
  schema: 'kb.registry/1';
  rev: number;
  version: string;
  generatedAt: string;
  expiresAt?: string;
  ttlMs?: number;
  partial: boolean;
  stale: boolean;
  source: {
    cliVersion: string;
    cwd: string;
  };
  corrupted?: boolean;
  checksum?: string;
  checksumAlgorithm?: 'sha256';
  previousChecksum?: string | null;
  plugins: Array<{
    id: string;
    version: string;
    kind: 'v2' | 'v3';
    source: { kind: SourceKind; path: string };
  }>;
  manifests: RegistrySnapshotManifestEntry[];
  /** Discovery errors for plugins that failed to load */
  errors?: DiscoveryError[];
  ts: number;
}

/**
 * Snapshot without integrity fields (for checksum computation).
 */
export type SnapshotWithoutIntegrity = Omit<RegistrySnapshot, 'checksum' | 'checksumAlgorithm' | 'previousChecksum'>;
