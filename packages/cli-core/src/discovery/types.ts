/**
 * @module @kb-labs/cli-core/discovery/types
 * Discovery strategy types
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { PluginBrief } from '../registry/plugin-registry';

/**
 * Discovery result from a strategy
 */
export interface DiscoveryResult {
  /** Discovered plugins */
  plugins: PluginBrief[];
  /** Associated manifests */
  manifests: Map<string, ManifestV2>;
  /** Errors encountered (non-fatal) */
  errors: Array<{
    path: string;
    error: string;
  }>;
}

/**
 * Discovery strategy interface
 */
export interface DiscoveryStrategy {
  /** Strategy name */
  name: 'workspace' | 'pkg' | 'dir' | 'file';
  
  /** Priority (lower = higher priority) */
  priority: number;
  
  /**
   * Discover plugins
   * @param roots - Root directories to search
   * @returns Discovery result
   */
  discover(roots: string[]): Promise<DiscoveryResult>;
}

