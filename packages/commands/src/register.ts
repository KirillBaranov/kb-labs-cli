import { registry } from "./registry";
import { hello } from "./commands/hello";
import { version } from "./commands/version";
import { diagnose } from "./commands/diagnose";
import { initProfile } from "./commands/init-profile";
import { profilesValidate, profilesResolve, profilesInit } from "./commands/profiles";

let _registered = false;

export function registerBuiltinCommands() {
  if (_registered) {
    return;
  }
  _registered = true;

  registry.register(hello);
  registry.register(version);
  registry.register(diagnose);
  registry.register(initProfile);
  registry.register(profilesValidate);
  registry.register(profilesResolve);
  registry.register(profilesInit);
}
