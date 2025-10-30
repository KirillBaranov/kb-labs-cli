import { registry } from "./registry";
import type { RegisteredCommand } from "../registry/types.js";
import { hello } from "../commands/system/hello";
import { version } from "../commands/system/version";
import { diagnose } from "../commands/system/diagnose";
import { doctor } from "../commands/system/doctor";
import { diag } from "../commands/system/diag";
import { pluginsList } from "../commands/system/plugins-list";
import { pluginsEnable } from "../commands/system/plugins-enable";
import { pluginsDisable } from "../commands/system/plugins-disable";
import { pluginsLink } from "../commands/system/plugins-link";
import { pluginsUnlink } from "../commands/system/plugins-unlink";
import { pluginsDoctor } from "../commands/system/plugins-doctor";
import { pluginsWatch } from "../commands/system/plugins-watch";
import { pluginsScaffold } from "../commands/system/plugins-scaffold";
import { pluginsTelemetry } from "../commands/system/plugins-telemetry";
import { pluginsCacheClear } from "../builtins/plugins-cache-clear";
import { discoverManifests } from "../registry/discover";
import { registerManifests, disposeAllPlugins } from "../registry/register";
import { log } from "./logger";

let _registered = false;
const registeredCommands: any[] = [];

export async function registerBuiltinCommands() {
  if (_registered) {
    return;
  }
  _registered = true;

  // Standalone commands
  registry.register(hello);
  registry.register(version);
  registry.register(diagnose);
  registry.register(doctor);
  registry.register(diag);
  registry.register(pluginsList);
  registry.register(pluginsEnable);
  registry.register(pluginsDisable);
  registry.register(pluginsLink);
  registry.register(pluginsUnlink);
  registry.register(pluginsDoctor);
  registry.register(pluginsWatch);
  registry.register(pluginsScaffold);
  registry.register(pluginsTelemetry);
  registry.register(pluginsCacheClear);
  
  // Discover and register manifest-based commands from workspace/node_modules
  try {
    const noCache = process.argv.includes('--no-cache');
    const discovered = await discoverManifests(process.cwd(), noCache);
    
    if (discovered.length > 0) {
      log('info', `Discovered ${discovered.length} packages with CLI manifests`);
      const registered = await registerManifests(discovered, registry);
      registeredCommands.push(...registered);
      
      // Check for self-update notices (CLI version compatibility)
      checkSelfUpdateNotices(registered);
    } else {
      log('debug', 'No external CLI manifests discovered');
    }
  } catch (err: any) {
    // Fail-open: if discovery fails, continue with built-in commands
    log('warn', `Discovery failed: ${err.message}`);
  }
  
  // Register shutdown handler for dispose hooks
  process.on('SIGINT', async () => {
    await disposeAllPlugins(registry);
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await disposeAllPlugins(registry);
    process.exit(0);
  });
}

/**
 * Check for self-update notices (CLI version compatibility warnings)
 */
function checkSelfUpdateNotices(registered: RegisteredCommand[]): void {
  const currentCliVersion = process.env.CLI_VERSION || '0.1.0';
  
  for (const cmd of registered) {
    const required = cmd.manifest.engine?.kbCli;
    if (!required || !currentCliVersion) continue;
    
    // Simple semver check
    if (required.startsWith('^')) {
      const requiredVersion = required.replace('^', '').trim();
      const requiredMajor = parseInt(requiredVersion.split('.')[0] || '0');
      const currentMajor = parseInt(currentCliVersion.split('.')[0] || '0');
      
      if (currentMajor < requiredMajor) {
        log('warn', `Plugin ${cmd.manifest.package || cmd.manifest.group} requires kb-cli ${required}, found ${currentCliVersion}`);
        log('warn', `  → Upgrade CLI: pnpm -w update @kb-labs/cli`);
      }
    }
  }
}
