/**
 * @module @kb-labs/cli-api/modules/snapshot/utils
 * Utility functions for snapshot operations.
 */

import { createHash } from 'node:crypto';
import type { SnapshotWithoutIntegrity } from './types.js';

export const SNAPSHOT_CHECKSUM_ALGORITHM = 'sha256';

/**
 * Deep clone a value using structuredClone or JSON fallback.
 */
export function cloneValue<T>(value: T): T {
  const globalClone = (globalThis as unknown as { structuredClone?: (value: unknown) => unknown }).structuredClone;
  if (typeof globalClone === 'function') {
    return globalClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Stable JSON stringify for deterministic checksums.
 * Sorts object keys and filters undefined values.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
}

/**
 * Compute SHA256 checksum for a snapshot.
 */
export function computeSnapshotChecksum(snapshot: SnapshotWithoutIntegrity): string {
  return createHash(SNAPSHOT_CHECKSUM_ALGORITHM).update(stableStringify(snapshot)).digest('hex');
}

/**
 * Parse an integer safely, returning 0 for invalid values.
 */
export function safeParseInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}
