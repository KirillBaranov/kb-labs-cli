/**
 * @module @kb-labs/cli-runtime/formatters/builtin/markdown
 * Markdown formatter
 */

import type { OutputFormatter } from '../formatters-registry';

export const markdownFormatter: OutputFormatter = {
  name: 'markdown',
  format(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return `\`${JSON.stringify(data)}\``;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return '';

      const firstItem = data[0];
      if (typeof firstItem !== 'object' || firstItem === null) {
        return data.map(item => `- ${item}`).join('\n');
      }

      // Array of objects - create table
      const keys = Object.keys(firstItem);
      const header = `| ${keys.join(' | ')} |`;
      const separator = `| ${keys.map(() => '---').join(' | ')} |`;
      const rows = data.map(item => {
        const values = keys.map(k => (item as any)[k]);
        return `| ${values.join(' | ')} |`;
      });
      return [header, separator, ...rows].join('\n');
    }

    // Single object
    return Object.entries(data)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');
  },
};

