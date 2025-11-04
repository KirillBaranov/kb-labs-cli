/**
 * @module @kb-labs/cli-runtime
 * CLI runtime - command execution, middleware, formatters
 */

// Middleware
export {
  MiddlewareManager,
  type CommandMiddleware,
  type MiddlewareConfig,
} from './middleware/middleware-manager.js';

// Formatters
export {
  FormattersRegistry,
  type OutputFormatter,
} from './formatters/formatters-registry.js';
export { jsonFormatter } from './formatters/builtin/json.js';
export { yamlFormatter } from './formatters/builtin/yaml.js';
export { tableFormatter } from './formatters/builtin/table.js';
export { markdownFormatter } from './formatters/builtin/markdown.js';

