import { registry } from "./registry";
import { hello } from "./commands/hello";
import { version } from "./commands/version";
import { diagnose } from "./commands/diagnose";
import { initProfile } from "./commands/init-profile";
// TODO: Re-enable when @kb-labs/core-* dependencies are available
// import { profilesValidate, profilesResolve, profilesInit } from "./commands/profiles";
import { devlinkPlan, devlinkApply, devlinkLockApply, devlinkUndo, devlinkStatus } from "./commands/devlink";

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
  // TODO: Re-enable when @kb-labs/core-* dependencies are available
  // registry.register(profilesValidate);
  // registry.register(profilesResolve);
  // registry.register(profilesInit);
  registry.register(devlinkPlan);
  registry.register(devlinkApply);
  registry.register(devlinkLockApply);
  registry.register(devlinkUndo);
  registry.register(devlinkStatus);
}
