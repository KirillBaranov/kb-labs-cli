/**
 * @module @kb-labs/cli-runtime
 * CLI runtime - command execution, middleware, formatters
 */

// Middleware
export {
  MiddlewareManager,
  type CommandMiddleware,
  type MiddlewareConfig,
} from './middleware/middleware-manager';

// Formatters
export {
  FormattersRegistry,
  type OutputFormatter,
} from './formatters/formatters-registry';
export { jsonFormatter } from './formatters/builtin/json';
export { yamlFormatter } from './formatters/builtin/yaml';
export { tableFormatter } from './formatters/builtin/table';
export { markdownFormatter } from './formatters/builtin/markdown';

// Runtime context helpers
export { createRuntimeContext } from './context/runtime-context';
export {
  createCliRuntime,
  type CliRuntime,
  type RuntimeSetupOptions,
} from "./runtime";

