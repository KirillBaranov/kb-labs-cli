/**
 * @module @kb-labs/cli-api/factory
 * Factory for creating CLI API instances
 */

import type { CliAPI, CliInitOptions } from './types';
import { CliAPIImpl } from './cli-api-impl';

/**
 * Create CLI API instance
 * @param opts - Initialization options
 * @returns CLI API instance
 */
export async function createCliAPI(opts?: CliInitOptions): Promise<CliAPI> {
  const api = new CliAPIImpl(opts);
  await api.initialize();
  return api;
}

