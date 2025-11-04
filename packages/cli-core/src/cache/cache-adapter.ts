/**
 * @module @kb-labs/cli-core/cache/cache-adapter
 * Cache adapter interface
 */

/**
 * Cache adapter interface for pluggable caching
 */
export interface CacheAdapter {
  /**
   * Get value from cache
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get(key: string): Promise<unknown | null>;

  /**
   * Set value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds (optional)
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * Invalidate cache entries matching pattern
   * @param pattern - Pattern to match (supports '*' wildcard)
   */
  invalidate(pattern: string): Promise<void>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;
}

