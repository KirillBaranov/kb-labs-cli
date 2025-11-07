import { registry } from "./registry";
import type { RegisteredCommand } from "../registry/types.js";
import type { Command } from "../types/types.js";
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
import { pluginsRegistry } from "../commands/system/plugins-registry";
import { pluginsCacheClear } from "../builtins/plugins-cache-clear";
import { replay } from "../commands/debug/replay";
import { fix } from "../commands/debug/fix";
import { repl } from "../commands/debug/repl";
import { dev } from "../commands/debug/dev";
import { trace } from "../commands/debug/trace";
import { fixture } from "../commands/debug/fixture";
import { createPluginsIntrospectCommand } from "../plugins-introspect.js";
import { registerManifests, disposeAllPlugins } from "../registry/register";
import { PluginRegistry } from "@kb-labs/cli-core";
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
  registry.register(pluginsRegistry);
  registry.register(pluginsCacheClear);
  
  // Debug commands
  registry.register(replay);
  registry.register(fix);
  registry.register(repl);
  registry.register(dev);
  registry.register(trace);
  registry.register(fixture);
  
  // Convert CliCommand to Command for introspect
  const introspectCliCommand = createPluginsIntrospectCommand();
  registry.register({
    name: introspectCliCommand.name,
    describe: introspectCliCommand.description,
    category: 'system',
    aliases: [],
    async run(ctx, argv, flags) {
      return introspectCliCommand.run(ctx, argv, flags);
    },
  });
  
    try {
      const noCache = process.argv.includes('--no-cache') || process.env.KB_PLUGIN_NO_CACHE === '1';
      const { discoverManifests } = await import('../registry/discover.js');
      const discovered = await discoverManifests(process.cwd(), noCache);
    
    if (discovered.length > 0) {
      log('info', `Discovered ${discovered.length} packages with CLI manifests`);
      const registered = await registerManifests(discovered, registry);
      if (registered.length > 0) {
        log('info', `Registered ${registered.length} commands from manifests`);
        registeredCommands.push(...registered);
      }
    }
    
    const pluginRegistry = new PluginRegistry({
      strategies: ['workspace', 'pkg', 'dir', 'file'],
    });
    await pluginRegistry.refresh();
    const plugins = pluginRegistry.list();
    
    if (plugins.length > 0) {
      log('info', `Discovered ${plugins.length} plugins via cli-core`);
    }
  } catch (err: any) {
    log('warn', `Discovery failed: ${err.message}`);
  }
  
  process.on('SIGINT', async () => {
    await disposeAllPlugins(registry);
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await disposeAllPlugins(registry);
    process.exit(0);
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
        log('warn', `Plugin ${cmd.manifest.package || cmd.manifest.group} requires kb-cli ${required}, found ${currentCliVersion}`);
        log('warn', `  → Upgrade CLI: pnpm -w update @kb-labs/cli`);
      }
    }
  }
}
