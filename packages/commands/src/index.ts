/**
 * @kb-labs/cli-commands
 * Public surface: types, registry, findCommand, registerBuiltinCommands.
 * This package does not handle parsing argv/logging/exit.
 */
export * from "./types";
export { registry, findCommand } from "./registry";
export { registerBuiltinCommands } from "./register";

export { hello } from "./commands/hello";
export { version } from "./commands/version";
export { diagnose } from "./commands/diagnose";
export { initProfile } from "./commands/init-profile";
// TODO: Re-enable when @kb-labs/core-* dependencies are available
// export { profilesValidate, profilesResolve, profilesInit } from "./commands/profiles";
export { devlinkPlan, devlinkApply, devlinkLockApply, devlinkUndo, devlinkStatus } from "./commands/devlink";
