/**
 * @module @kb-labs/cli-core/cache/schema-cache
 * Schema caching for performance optimization
 */

import { z } from 'zod';
import * as crypto from 'node:crypto';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

/**
 * Schema cache for Zod schemas with checksum-based invalidation
 */
export class SchemaCache {
  private cache = new Map<string, z.ZodTypeAny>();
  private checksums = new Map<string, string>();

  /**
   * Get or load schema with checksum-based caching
   * @param schemaRef - Schema reference (e.g., './schemas/review.ts#ReviewSchema')
   * @param manifestChecksum - Checksum of the manifest
   * @returns Zod schema or null if not found
   */
  async getSchema(
    schemaRef: string,
    manifestChecksum: string
  ): Promise<z.ZodTypeAny | null> {
    const cacheKey = `${manifestChecksum}:${schemaRef}`;

    // Check cache
    const cachedChecksum = this.checksums.get(schemaRef);
    if (cachedChecksum === manifestChecksum && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Parse schemaRef: './schemas/review.ts#ReviewSchema'
    const [modulePath, exportName] = schemaRef.split('#');
    if (!exportName || !modulePath) {
      console.warn(`[SchemaCache] Invalid schema ref: ${schemaRef}`);
      return null;
    }

    try {
      // Dynamic import
      const module = await import(modulePath);
      const schema = module[exportName];

      // Validate it's a Zod schema
      if (schema && typeof schema.parse === 'function') {
        this.cache.set(cacheKey, schema);
        this.checksums.set(schemaRef, manifestChecksum);
        return schema;
      } else {
        console.warn(
          `[SchemaCache] Export ${exportName} is not a valid Zod schema`
        );
        return null;
      }
    } catch (error) {
      console.warn(`[SchemaCache] Failed to load schema ${schemaRef}:`, error);
      return null;
    }
  }

  /**
   * Preload schemas for a manifest
   * @param manifest - Plugin manifest
   * @param schemaRefs - Array of schema references to preload
   */
  async preload(manifest: ManifestV2, schemaRefs: string[]): Promise<void> {
    const checksum = calculateManifestChecksum(manifest);
    const promises = schemaRefs.map((ref) => this.getSchema(ref, checksum));
    await Promise.allSettled(promises);
  }

  /**
   * Invalidate cache for specific schema or all schemas
   * @param schemaRef - Optional schema reference to invalidate
   */
  invalidate(schemaRef?: string): void {
    if (schemaRef) {
      // Invalidate specific schema
      const checksum = this.checksums.get(schemaRef);
      if (checksum) {
        this.cache.delete(`${checksum}:${schemaRef}`);
        this.checksums.delete(schemaRef);
      }
    } else {
      // Invalidate all
      this.cache.clear();
      this.checksums.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clear all cached schemas
   */
  clear(): void {
    this.cache.clear();
    this.checksums.clear();
  }
}

/**
 * Calculate checksum for a manifest
 * Used for cache invalidation
 * @param manifest - Plugin manifest
 * @returns Hex checksum (16 chars)
 */
export function calculateManifestChecksum(manifest: ManifestV2): string {
  // Serialize manifest to stable JSON
  const stable = JSON.stringify(manifest, Object.keys(manifest).sort());
  
  return crypto
    .createHash('sha256')
    .update(stable)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Global schema cache instance
 */
let globalSchemaCache: SchemaCache | null = null;

/**
 * Get or create global schema cache
 */
export function getSchemaCache(): SchemaCache {
  if (!globalSchemaCache) {
    globalSchemaCache = new SchemaCache();
  }
  return globalSchemaCache;
}

/**
 * Reset global schema cache (for testing)
 */
export function resetSchemaCache(): void {
  globalSchemaCache = null;
}

