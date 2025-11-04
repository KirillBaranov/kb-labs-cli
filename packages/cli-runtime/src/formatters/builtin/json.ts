/**
 * @module @kb-labs/cli-runtime/formatters/builtin/json
 * JSON formatter
 */

import type { OutputFormatter } from '../formatters-registry.js';

export const jsonFormatter: OutputFormatter = {
  name: 'json',
  format(data: unknown): string {
    return JSON.stringify(data, null, 2);
  },
};

