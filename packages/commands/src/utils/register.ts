import { registry } from "./registry";
import { hello } from "../commands/system/hello";
import { version } from "../commands/system/version";
import { diagnose } from "../commands/system/diagnose";
import { pluginsList } from "../commands/system/plugins-list";
import { discoverManifests } from "../registry/discover.js";
import { registerManifests } from "../registry/register.js";
import { log } from "./logger.js";
import { devlinkGroup } from "../commands/devlink";
import { profilesGroup } from "../commands/profiles";
import { bundleGroup } from "../commands/bundle";
import { initGroup } from "../commands/init-group";
// import { mindGroup } from "../commands/mind-group";

let _registered = false;

export async function registerBuiltinCommands() {
  if (_registered) {
    return;
  }
  _registered = true;

  // Register command groups
  // registry.registerGroup(initGroup);
  // registry.registerGroup(devlinkGroup); // Using plugin system instead
  // registry.registerGroup(profilesGroup);
  // registry.registerGroup(bundleGroup);
  // registry.registerGroup(mindGroup);

  // Standalone commands
  registry.register(hello);
  registry.register(version);
  registry.register(diagnose);
  registry.register(pluginsList);
  
  // Discover and register manifest-based commands from workspace/node_modules
  try {
    const noCache = process.argv.includes('--no-cache');
    const discovered = await discoverManifests(process.cwd(), noCache);
    
    if (discovered.length > 0) {
      log('info', `Discovered ${discovered.length} packages with CLI manifests`);
      registerManifests(discovered, registry);
    } else {
      log('debug', 'No external CLI manifests discovered');
    }
  } catch (err: any) {
    // Fail-open: if discovery fails, continue with built-in commands
    log('warn', `Discovery failed: ${err.message}`);
  }
}
