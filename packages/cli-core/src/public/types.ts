// Re-export types from cli-contracts (breaking circular dependency)
export type { SystemContext, Presenter } from "@kb-labs/cli-contracts";
// Note: V1 types (CliCommand, CliContext, Profile, FlagBuilder) removed - use V3 plugin system instead
