/**
 * Mock discovery implementation for testing without external dependencies
 */

import type { DiscoveryResult } from './types.js';
import { log } from '../utils/logger.js';

/**
 * Mock discovery function that returns empty results
 * This allows testing the registry system without external dependencies
 */
export async function discoverManifests(cwd: string, noCache = false): Promise<DiscoveryResult[]> {
  log('debug', 'Mock discovery: no external manifests found');
  return [];
}
