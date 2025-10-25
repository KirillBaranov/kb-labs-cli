/**
 * Mock register implementation for testing without external dependencies
 */

import type { DiscoveryResult, RegisteredCommand } from './types.js';
import type { CommandRegistry } from '../types/types.js';
import { log } from '../utils/logger.js';

/**
 * Mock register function that does nothing
 * This allows testing the registry system without external dependencies
 */
export function registerManifests(
  discoveryResults: DiscoveryResult[],
  registry: CommandRegistry
): RegisteredCommand[] {
  log('debug', 'Mock register: no manifests to register');
  return [];
}
