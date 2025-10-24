import { registry } from "./registry";
import { hello } from "../commands/system/hello";
import { version } from "../commands/system/version";
import { diagnose } from "../commands/system/diagnose";
import { devlinkGroup } from "../commands/devlink";
import { profilesGroup } from "../commands/profiles";
import { bundleGroup } from "../commands/bundle";
import { setupGroup } from "../commands/init-group";

let _registered = false;

export function registerBuiltinCommands() {
  if (_registered) {
    return;
  }
  _registered = true;

  // Register command groups
  registry.registerGroup(setupGroup);
  registry.registerGroup(devlinkGroup);
  registry.registerGroup(profilesGroup);
  registry.registerGroup(bundleGroup);

  // Standalone commands
  registry.register(hello);
  registry.register(version);
  registry.register(diagnose);
}
