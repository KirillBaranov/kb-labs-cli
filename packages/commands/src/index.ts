/**
 * @kb-labs/cli-commands
 * Public surface: types, registry, findCommand, registerBuiltinCommands.
 * This package does not handle parsing argv/logging/exit.
 */
export * from "./types";
export { registry, findCommand, type ProductGroup } from "./utils/registry";
export { registerBuiltinCommands } from "./utils/register";
export * from "./utils/help-generator";

export { hello } from "./commands/system/hello";
export { version } from "./commands/system/version";
export { diagnose } from "./commands/system/diagnose";
// export { profilesValidate, profilesResolve, profilesInit } from "./commands/profiles"; // Removed - using plugin system
// export { devlinkPlan, devlinkApply, devlinkFreeze, devlinkLockApply, devlinkUndo, devlinkStatus } from "./commands/devlink"; // Removed - using plugin system
// export { bundlePrint, bundleExplain } from "./commands/bundle"; // Removed - using plugin system

// Mind commands - auto-discovered via manifest system from @kb-labs/mind-cli
// Profiles, Bundle, Init commands - auto-discovered via manifest system from @kb-labs/core
