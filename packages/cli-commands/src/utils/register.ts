import { registry } from "../registry/service";
import type { RegisteredCommand } from "../registry/types";
import {
  infoGroup,
  pluginsGroup,
  docsGroup,
  logsGroup,
} from "../commands/system/groups";
import { registerManifests, disposeAllPlugins, preflightManifests } from "../registry/register";
import { PluginRegistry } from "@kb-labs/cli-core";
import { registerShutdownHook } from "./shutdown";
import { getContextCwd } from "@kb-labs/shared-cli-ui";
import { type Logger, createNoOpLogger } from "@kb-labs/cli-core";

let _registered = false;
const registeredCommands: any[] = [];

export interface RegisterBuiltinCommandsInput {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
}

export async function registerBuiltinCommands(
  input: RegisterBuiltinCommandsInput = {},
) {
  const log = input.logger ?? createNoOpLogger();

  if (_registered) {
    return;
  }
  _registered = true;
  registry.markPartial(true);
  registeredCommands.length = 0;

  // Register system command groups (migrated commands)
  registry.registerGroup(infoGroup);
  registry.registerGroup(pluginsGroup);
  registry.registerGroup(docsGroup);
  registry.registerGroup(logsGroup);

  try {
    const cwd = getContextCwd({ cwd: input.cwd });
    const env = input.env ?? process.env;
    const noCache =
      process.argv.includes("--no-cache") || env.KB_PLUGIN_NO_CACHE === "1";
    const { discoverManifests } = await import('../registry/discover');
    const discovered = await discoverManifests(cwd, noCache);

    if (discovered.length > 0) {
      log.info(`Discovered ${discovered.length} packages with CLI manifests`);
      const { valid: readyToRegister, skipped: preflightSkipped } = preflightManifests(discovered, log);

      if (preflightSkipped.length > 0) {
        log.warn(`Preflight skipped ${preflightSkipped.length} manifest(s) during validation`);
        for (const skipped of preflightSkipped) {
          log.warn(`  • ${skipped.id} [${skipped.source}] → ${skipped.reason}`);
        }
      }

      if (readyToRegister.length === 0) {
        log.error('All discovered manifests were skipped during preflight validation');
        registry.markPartial(true);
        _registered = false;
        return;
      }

      const result = await registerManifests(readyToRegister, registry, {
        cwd,
        logger: log,
      });
      if (result.registered.length > 0) {
        log.info(`Registered ${result.registered.length} commands from manifests`);
        registeredCommands.push(...result.registered);
      }
      if (result.skipped.length > 0) {
        for (const skipped of result.skipped) {
          log.error(`Skipped manifest ${skipped.id} from ${skipped.source}: ${skipped.reason}`);
        }
      }
      if (result.skipped.length > 0 || preflightSkipped.length > 0) {
        registry.markPartial(true);
      } else {
        registry.markPartial(false);
      }
    } else {
      registry.markPartial(false);
    }

    const pluginRegistry = new PluginRegistry({
      strategies: ['workspace', 'pkg', 'dir', 'file'],
    });
    await pluginRegistry.refresh();
    const plugins = pluginRegistry.list();

    if (plugins.length > 0) {
      log.info(`Discovered ${plugins.length} plugins via cli-core`);
    }
  } catch (err: any) {
    log.warn(`Discovery failed: ${err.message}`);
    registry.markPartial(true);
    _registered = false;
    return;
  }

  registerShutdownHook(async () => {
    await disposeAllPlugins(registry, log);
  });
}

export function checkSelfUpdateNotices(registered: RegisteredCommand[]): void {
  const currentCliVersion = process.env.CLI_VERSION || '0.1.0';
  
  for (const cmd of registered) {
    const required = cmd.manifest.engine?.kbCli;
    if (!required || !currentCliVersion) {continue;}
    
    if (required.startsWith('^')) {
      const requiredVersion = required.replace('^', '').trim();
      const requiredMajor = parseInt(requiredVersion.split('.')[0] || '0');
      const currentMajor = parseInt(currentCliVersion.split('.')[0] || '0');
      
      if (currentMajor < requiredMajor) {
        console.warn(`[kb-cli] Plugin ${cmd.manifest.package || cmd.manifest.group} requires kb-cli ${required}, found ${currentCliVersion}`);
        console.warn(`[kb-cli]   → Upgrade CLI: pnpm -w update @kb-labs/cli`);
      }
    }
  }
}
