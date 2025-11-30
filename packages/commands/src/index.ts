/**
 * @kb-labs/cli-commands
 * Public surface: types, registry, findCommand, registerBuiltinCommands.
 * This package does not handle parsing argv/logging/exit.
 */
export * from "./types";
export {
  registry,
  findCommand,
  type ProductGroup,
} from "./registry/service";
export { registerBuiltinCommands } from "./utils/register";
export * from "./utils/help-generator";
export { TimingTracker } from "@kb-labs/shared-cli-ui";
export { discoverManifestsByNamespace } from "./registry/discover";
export { telemetry } from "./registry/telemetry";

export { hello } from "./commands/system/hello";
export { health } from "./commands/system/health";
export { version } from "./commands/system/version";
export { diagnose } from "./commands/system/diagnose";
export { loggingCheck } from "./commands/system/logging-check";
export { loggingInit } from "./commands/system/logging-init";
export { createPluginsIntrospectCommand } from "./plugins-introspect";
export {
  wfRun,
  wfValidate,
  wfRunsList,
  wfRunsGet,
  wfLogs,
  wfCancel,
  workflowCommandGroup,
} from "./commands/workflows";
export { worker } from "./commands/worker";
export {
  jobsList,
  jobsEnable,
  jobsDisable,
  jobsStatus,
  jobsTrigger,
} from "./commands/jobs";
