/**
 * @kb-labs/cli-commands
 * Public surface: types, registry, findCommand, registerBuiltinCommands.
 * This package does not handle parsing argv/logging/exit.
 */
export * from "./types";
export {
  registry,
  findCommand,
  findCommandWithType,
  type ProductGroup,
  type CommandType,
  type CommandLookupResult,
} from "./registry/service";
export { registerBuiltinCommands } from "./utils/register";
export * from "./utils/help-generator";
export { generateExamples, type ExampleCase } from "./utils/generate-examples";
export { TimingTracker } from "@kb-labs/shared-cli-ui";
export { discoverManifestsByNamespace, discoverManifests } from "./registry/discover";
export { telemetry } from "./registry/telemetry";

export { hello } from "./commands/system/hello";
export { health } from "./commands/system/health";
export { version } from "./commands/system/version";
export { diagnose } from "./commands/system/diagnose";
export { loggingCheck } from "./commands/system/logging-check";
export { loggingInit } from "./commands/system/logging-init";
export { createPluginsIntrospectCommand } from "./plugins-introspect";
export * from "./commands/workflows";
