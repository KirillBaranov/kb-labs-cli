/**
 * System command groups - Organized categories for system commands
 */

import { defineSystemCommandGroup } from '@kb-labs/shared-command-kit';
import { hello } from './hello';
import { version } from './version';
import { health } from './health';
import { diagnose } from './diagnose';
import { diag } from './diag';
import { pluginsList } from './plugins-list';
import { pluginsCommands } from './plugins-commands';
import { pluginsEnable } from './plugins-enable';
import { pluginsDisable } from './plugins-disable';
import { pluginsLink } from './plugins-link';
import { pluginsUnlink } from './plugins-unlink';
import { pluginsWatch } from './plugins-watch';
import { pluginsTelemetry } from './plugins-telemetry';
import { pluginsDiscoveryTest } from './plugins-discovery-test';
import { pluginsCacheClear } from '../../builtins/plugins-cache-clear';
import { pluginsTrust, pluginsUntrust, pluginsTrustStatus } from './plugins-trust';
import { pluginsRegistry } from './plugins-registry';
import { pluginsDoctor } from './plugins-doctor';
import { pluginsScaffold } from './plugins-scaffold';
import { pluginValidate } from './plugins-validate';
import { loggingCheck } from './logging-check';
import { loggingInit } from './logging-init';
import { logTest } from './log-test';
import { registryLint } from './registry-lint';
import { headersDebug } from './headers-debug';
import { docsGenerateCliReference } from './docs-generate-cli-reference';

/**
 * Info Commands Group
 * Basic system information and health checks
 */
export const infoGroup = defineSystemCommandGroup('info', 'System information commands', [
  hello,
  version,
  health,
  diagnose,
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
  pluginsWatch,
  pluginsTelemetry,
  pluginsDiscoveryTest,
  pluginsCacheClear,
  pluginsTrust,
  pluginsUntrust,
  pluginsTrustStatus,
  pluginsRegistry,
  pluginsDoctor,
  pluginsScaffold,
  pluginValidate,
]);

/**
 * Registry Commands Group
 * Registry and manifest validation
 */
export const registryGroup = defineSystemCommandGroup('registry', 'Registry and manifest related commands', [
  registryLint,
  headersDebug,
]);

/**
 * Debug Commands Group
 * Debug and development tools
 */
export const debugGroup = defineSystemCommandGroup('debug', 'Debug and development commands', [
  // Debug commands temporarily removed during V3 migration
]);

/**
 * Logging Commands Group
 * Logging configuration and testing
 */
export const loggingGroup = defineSystemCommandGroup('logging', 'Logging configuration commands', [
  logTest,
  loggingCheck,
  loggingInit,
]);

/**
 * Docs Commands Group
 * Documentation generation and maintenance
 */
export const docsGroup = defineSystemCommandGroup('docs', 'Documentation generation commands', [
  docsGenerateCliReference,
]);
