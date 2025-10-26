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
export { profilesValidate, profilesResolve, profilesInit } from "./commands/profiles";
// export { devlinkPlan, devlinkApply, devlinkFreeze, devlinkLockApply, devlinkUndo, devlinkStatus } from "./commands/devlink"; // Removed - using plugin system
export { bundlePrint, bundleExplain } from "./commands/bundle";

// Mind commands - temporarily disabled until packages are linked
// export { mindInit, mindUpdate, mindPack, mindFeed } from "./commands/mind";

// Init commands
export { setupAll, setupWorkspace, setupProfile, setupPolicy } from "./commands/init";
