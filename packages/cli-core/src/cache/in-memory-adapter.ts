/**
 * @module @kb-labs/cli-core/cache/in-memory-adapter
 * In-memory cache adapter implementation
 */

import type { CacheAdapter } from "./cache-adapter";

interface CacheEntry {
  value: unknown;
  expires: number; // timestamp in ms (0 = never expires)
}

/**
 * In-memory cache adapter with TTL support
 */
export class InMemoryCacheAdapter implements CacheAdapter {
  private cache: Map<string, CacheEntry> = new Map();

  async get(key: string): Promise<unknown | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expires > 0 && Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl : 0;
    this.cache.set(key, { value, expires });
  }

  async invalidate(pattern: string): Promise<void> {
    // Simple wildcard matching
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");

    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
