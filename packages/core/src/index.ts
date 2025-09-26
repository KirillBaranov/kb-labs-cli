// Core types and interfaces
export * from "./types/index";
export * from "./command";
export * from "./context";
export * from "./flags";

// Error handling
export * from "./errors";

// I/O and adapters
export * from "./io/types";

// Plugins system
export * from "./plugins/types";

// Presenters
export * from "./presenter/types";
export * from "./presenter/text";
export * from "./presenter/json";

// Telemetry
export * from "./telemetry/types";

// Registry
export * from "./registry";

// Re-export specific functions that are imported by other packages
export { parseArgs } from "./flags";
export { mapCliErrorToExitCode, CliError } from "./errors";
export { createTextPresenter } from "./presenter/text";
export { createJsonPresenter } from "./presenter/json";
export { createContext } from "./context";
