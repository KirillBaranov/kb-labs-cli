/**
 * System command groups - Organized categories for system commands
 */

import { defineSystemCommandGroup } from '@kb-labs/cli-command-kit';
import { hello } from './hello.js';
import { version } from './version.js';
import { health } from './health.js';
import { diagnose } from './diagnose.js';
import { diag } from './diag.js';
import { pluginsList } from './plugins-list.js';
import { pluginsEnable } from './plugins-enable.js';
import { pluginsDisable } from './plugins-disable.js';
import { pluginsLink } from './plugins-link.js';
import { pluginsUnlink } from './plugins-unlink.js';
import { pluginsWatch } from './plugins-watch.js';
import { pluginsTelemetry } from './plugins-telemetry.js';
import { pluginsDiscoveryTest } from './plugins-discovery-test.js';
import { pluginsCacheClear } from '../../builtins/plugins-cache-clear.js';
import { pluginsTrust, pluginsUntrust, pluginsTrustStatus } from './plugins-trust.js';
import { pluginsRegistry } from './plugins-registry.js';
import { pluginsDoctor } from './plugins-doctor.js';
import { pluginsScaffold } from './plugins-scaffold.js';
import { pluginValidate } from './plugins-validate.js';
import { pluginGenerate } from './plugins-generate.js';
import { loggingCheck } from './logging-check.js';
import { loggingInit } from './logging-init.js';
import { logTest } from './log-test.js';
import { registryLint } from './registry-lint.js';
import { headersDebug } from './headers-debug.js';
import { replay } from '../debug/replay.js';
import { fix } from '../debug/fix.js';
import { trace } from '../debug/trace.js';
import { fixture } from '../debug/fixture.js';
import { repl } from '../debug/repl.js';
import { dev } from '../debug/dev.js';

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
  pluginGenerate,
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
  replay,
  fix,
  trace,
  fixture,
  repl,
  dev,
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

