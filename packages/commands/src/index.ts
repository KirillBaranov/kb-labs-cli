/**
 * @kb-labs/cli-commands
 * Public surface: types, registry, findCommand, registerBuiltinCommands.
 * This package does not handle parsing argv/logging/exit.
 */
export * from "./types";
export { registry, findCommand, type ProductGroup } from "./utils/registry";
export { registerBuiltinCommands } from "./utils/register";
export * from "./utils/help-generator";
export { TimingTracker } from "./utils/timing-tracker";
export { discoverManifestsByNamespace } from "./registry/discover";
export { telemetry } from "./registry/telemetry";

export { hello } from "./commands/system/hello";
export { version } from "./commands/system/version";
export { diagnose } from "./commands/system/diagnose";
