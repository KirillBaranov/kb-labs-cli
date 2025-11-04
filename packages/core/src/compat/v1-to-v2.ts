/**
 * @module @kb-labs/cli-core/compat/v1-to-v2
 * V1 to V2 manifest migration logic
 */

/**
 * Detect manifest version
 * @param manifest - Manifest object
 * @returns Version or 'unknown'
 */
export function detectManifestVersion(manifest: any): 'v1' | 'v2' | 'unknown' {
  if (!manifest || typeof manifest !== 'object') {
    return 'unknown';
  }

  // Check for V2 markers
  if ('id' in manifest && 'version' in manifest) {
    return 'v2';
  }

  // Check for V1 markers
  if ('manifestVersion' in manifest || 'commands' in manifest) {
    return 'v1';
  }

  return 'unknown';
}

/**
 * Migrate V1 manifest to V2
 * Note: This is a simplified migration
 * @param v1Manifest - V1 manifest
 * @param pluginId - Plugin ID
 * @returns V2 manifest (partial)
 */
export function migrateV1ToV2(v1Manifest: any, pluginId: string): any {
  // Basic migration - creates a minimal V2 structure
  return {
    id: pluginId,
    version: '1.0.0',
    display: {
      name: pluginId,
      description: v1Manifest.describe || 'Migrated from V1',
    },
    // V1 commands would need additional processing
    // This is a placeholder for now
    commands: [],
  };
}

/**
 * Get deprecation warning for V1 manifests
 * @param pluginId - Plugin ID
 * @returns Warning message
 */
export function getDeprecationWarning(pluginId: string): string {
  return `DEPRECATION: v1 manifest loaded for ${pluginId}. Please migrate to ManifestV2.`;
}

