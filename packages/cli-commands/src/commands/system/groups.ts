/**
 * System command groups - Organized categories for system commands
 */

import { defineSystemCommandGroup } from '@kb-labs/shared-command-kit';
import { hello } from './hello';
import { version } from './version';
import { health } from './health';
import { diag } from './diag';
import {
  pluginsList, pluginsCommands, pluginsEnable, pluginsDisable,
  pluginsLink, pluginsUnlink, pluginsRegistry, pluginsDoctor,
  pluginsScaffold, pluginValidate,
} from './plugins';
import { pluginsCacheClear } from '../../builtins/plugins-cache-clear';
import { docsGenerateCliReference } from './docs-generate-cli-reference';
import { logsDiagnose, logsContext, logsSummarize, logsQuery, logsSearch, logsGet, logsStats } from './logs';

/**
 * Info Commands Group
 * Basic system information and health checks
 */
export const infoGroup = defineSystemCommandGroup('info', 'System information commands', [
  hello,
  version,
  health,
  diag,
]);

/**
 * Plugins Commands Group
 * Plugin management and discovery
 */
export const pluginsGroup = defineSystemCommandGroup('plugins', 'Plugin management commands', [
  pluginsList,
  pluginsCommands,
  pluginsEnable,
  pluginsDisable,
  pluginsLink,
  pluginsUnlink,
  pluginsCacheClear,
  pluginsRegistry,
  pluginsDoctor,
  pluginsScaffold,
  pluginValidate,
]);

/**
 * Docs Commands Group
 * Documentation generation and maintenance
 */
export const docsGroup = defineSystemCommandGroup('docs', 'Documentation generation commands', [
  docsGenerateCliReference,
]);

/**
 * Logs Commands Group
 * Log viewing, querying, and analysis (agent-first)
 */
export const logsGroup = defineSystemCommandGroup('logs', 'Log viewing and analysis commands', [
  logsDiagnose,
  logsContext,
  logsSummarize,
  logsQuery,
  logsSearch,
  logsGet,
  logsStats,
]);
