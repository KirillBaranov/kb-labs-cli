/**
 * @module @kb-labs/cli-core/compat/detection
 * Version detection utilities
 */

/**
 * Check if manifest version is supported
 * @param version - Version string
 * @returns True if supported
 */
export function isManifestVersionSupported(version: string): boolean {
  // Support v1.x and v2.x
  return version.startsWith('1.') || version.startsWith('2.');
}

/**
 * Check for dual manifest (both V1 and V2)
 * @param manifest - Manifest object
 * @returns True if dual manifest detected
 */
export function checkDualManifest(manifest: any): boolean {
  if (!manifest || typeof manifest !== 'object') {
    return false;
  }

  // Check if both V1 and V2 fields exist
  const hasV1Fields = 'manifestVersion' in manifest || 'commands' in manifest;
  const hasV2Fields = 'id' in manifest && 'version' in manifest;

  return hasV1Fields && hasV2Fields;
}

