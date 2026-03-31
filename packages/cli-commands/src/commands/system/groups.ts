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
  pluginsScaffold, pluginValidate, marketplaceInstall, marketplaceUninstall, marketplaceUpdate,
} from './plugins';
import { registryDiagnostics } from './registry-diagnostics';
import { pluginsCacheClear } from '../../builtins/plugins-cache-clear';
import { docsGenerateCliReference } from './docs-generate-cli-reference';
import { logsDiagnose, logsContext, logsSummarize, logsQuery, logsSearch, logsGet, logsStats } from './logs';
import { authLogin, authLogout, authStatus, authCreateServiceAccount } from './auth';

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
 * Marketplace Commands Group
 * Marketplace package management and discovery
 */
export const marketplaceGroup = defineSystemCommandGroup('marketplace', 'Marketplace management commands', [
  marketplaceInstall,
  marketplaceUninstall,
  marketplaceUpdate,
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

/**
 * Auth Commands Group
 * Gateway authentication and credential management
 */
/**
 * Registry Commands Group
 * Entity registry diagnostics and management
 */
export const registryGroup = defineSystemCommandGroup('registry', 'Entity registry commands', [
  registryDiagnostics,
]);

/**
 * Auth Commands Group
 * Gateway authentication and credential management
 */
export const authGroup = defineSystemCommandGroup('auth', 'Gateway authentication commands', [
  authLogin,
  authLogout,
  authStatus,
  authCreateServiceAccount,
]);
