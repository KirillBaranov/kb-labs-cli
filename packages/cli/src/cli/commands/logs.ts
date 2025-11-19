/**
 * @module @kb-labs/cli/commands/logs
 * Log browser command for viewing and filtering execution logs
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getSnapshotsDir } from '@kb-labs/plugin-runtime/snapshot';
import {
  queryLogs,
  formatLogs,
  parseLogs,
  type LogQuery,
  type LogEntry,
} from '@kb-labs/sandbox/debug/log-query';

/**
 * Load logs from snapshots
 */
async function loadLogsFromSnapshots(
  workdir: string,
  pluginId?: string,
  limit: number = 100
): Promise<LogEntry[]> {
  try {
    const snapshotsDir = getSnapshotsDir(workdir);
    const files = await fs.readdir(snapshotsDir).catch(() => []);
    
    const snapshotFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const allLogs: LogEntry[] = [];

    for (const file of snapshotFiles) {
      try {
        const content = await fs.readFile(path.join(snapshotsDir, file), 'utf-8');
        const snapshot = JSON.parse(content) as { pluginId?: string; logs?: string[] };
        
        if (pluginId && snapshot.pluginId !== pluginId) continue;
        if (snapshot.logs) {
          const parsed = parseLogs(snapshot.logs);
          allLogs.push(...parsed);
        }
      } catch {
        // Skip invalid snapshots
      }
    }

    // Sort by timestamp descending
    return allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  } catch {
    return [];
  }
}

/**
 * Log browser command handler
 */
export async function handleLogsCommand(
  flags: {
    level?: string | string[];
    namespace?: string;
    search?: string;
    limit?: number;
    format?: 'human' | 'ai' | 'json' | 'csv';
    plugin?: string;
    from?: string;
    to?: string;
  },
  workdir: string = process.cwd()
): Promise<{ exitCode: number; output?: string }> {
  try {
    // Build query
    const query: LogQuery = {
      format: flags.format || 'human',
      limit: flags.limit,
    };

    // Parse level
    if (flags.level) {
      if (Array.isArray(flags.level)) {
        query.level = flags.level as LogQuery['level'];
      } else {
        query.level = flags.level as LogQuery['level'];
      }
    }

    // Parse namespace
    if (flags.namespace) {
      query.namespace = flags.namespace;
    }

    // Parse search
    if (flags.search) {
      query.search = flags.search;
    }

    // Parse time range
    if (flags.from || flags.to) {
      query.timeRange = {
        from: flags.from ? new Date(flags.from) : new Date(0),
        to: flags.to ? new Date(flags.to) : new Date(),
      };
    }

    // Load logs from snapshots
    const allLogs = await loadLogsFromSnapshots(workdir, flags.plugin, 1000);

    // Query logs
    const filteredLogs = queryLogs(allLogs, query);

    // Format output
    const output = formatLogs(filteredLogs, query.format);

    return {
      exitCode: 0,
      output: filteredLogs.length > 0 ? output : 'No logs found matching criteria.',
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `Error loading logs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

