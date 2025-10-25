/**
 * @kb-labs/cli-commands/utils
 * Path utilities - POSIX normalization for cross-platform compatibility
 */

/**
 * Convert path to POSIX format (forward slashes)
 * Use this only at serialization boundaries (cache, JSON output, registry)
 * For fs operations and resolvers, use native paths
 */
export function toPosixPath(filePath: string): string {
  return filePath.split('\\').join('/');
}

