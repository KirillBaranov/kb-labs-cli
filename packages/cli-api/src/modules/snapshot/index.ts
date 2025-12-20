/**
 * @module @kb-labs/cli-api/modules/snapshot
 * Snapshot management module.
 */

export { SnapshotManager, type SnapshotManagerOptions } from './snapshot-manager.js';
export type {
  RegistrySnapshot,
  RegistrySnapshotManifestEntry,
  SnapshotWithoutIntegrity,
} from './types.js';
export {
  cloneValue,
  stableStringify,
  computeSnapshotChecksum,
  safeParseInt,
  SNAPSHOT_CHECKSUM_ALGORITHM,
} from './utils.js';
