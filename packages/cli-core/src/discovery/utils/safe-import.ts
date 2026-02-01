/**
 * Safe dynamic import with timeout protection
 *
 * This prevents hanging when importing modules that have:
 * - Circular dependencies
 * - Top-level await that never resolves
 * - Other blocking initialization code
 *
 * @param modulePath - Absolute path to the module to import
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to the imported module
 * @throws Error if import times out or fails
 */
export async function safeImport<T = any>(
  modulePath: string,
  timeoutMs: number = 5000,
): Promise<T> {
  return Promise.race([
    import(modulePath) as Promise<T>,
    new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`Import timeout after ${timeoutMs}ms: ${modulePath}`),
          ),
        timeoutMs,
      );
    }),
  ]);
}

/**
 * Check if an error is an import timeout error
 */
export function isImportTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("Import timeout");
}
