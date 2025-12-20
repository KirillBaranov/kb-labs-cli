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
    source: { kind: SourceKind; path: string };
  }>;
  manifests: RegistrySnapshotManifestEntry[];
  ts: number;
}

/**
 * Snapshot without integrity fields (for checksum computation).
 */
export type SnapshotWithoutIntegrity = Omit<RegistrySnapshot, 'checksum' | 'checksumAlgorithm' | 'previousChecksum'>;
