import type { CliContext, ExecutionLimits } from "@kb-labs/cli-core/public";

import {
  MiddlewareManager,
  type MiddlewareConfig,
} from "./middleware/middleware-manager.js";
import {
  FormattersRegistry,
  type OutputFormatter,
} from "./formatters/formatters-registry.js";
import {
  createRuntimeContext,
  type RuntimeContextOptions,
} from "./context/runtime-context.js";
import { jsonFormatter } from "./formatters/builtin/json.js";
import { yamlFormatter } from "./formatters/builtin/yaml.js";
import { tableFormatter } from "./formatters/builtin/table.js";
import { markdownFormatter } from "./formatters/builtin/markdown.js";

const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  lifecycleTimeoutMs: 30_000,
  middlewareTimeoutMs: 5_000,
  discoveryTimeoutMs: 30_000,
};

export interface RuntimeSetupOptions extends RuntimeContextOptions {
  executionLimits?: ExecutionLimits;
  middlewares?: MiddlewareConfig[];
  formatters?: OutputFormatter[];
  context?: CliContext;
}

export interface CliRuntime {
  context: CliContext;
  middleware: MiddlewareManager;
  formatters: FormattersRegistry;
  registerMiddleware(middleware: MiddlewareConfig): void;
  registerFormatter(formatter: OutputFormatter): void;
}

export async function createCliRuntime(
  options: RuntimeSetupOptions,
): Promise<CliRuntime> {
  const {
    executionLimits,
    middlewares,
    formatters,
    context: providedContext,
    ...contextOptions
  } = options;

  const context =
    providedContext ?? (await createRuntimeContext(contextOptions));

  const middlewareManager = new MiddlewareManager(
    executionLimits ?? DEFAULT_EXECUTION_LIMITS,
  );
  for (const middleware of middlewares ?? []) {
    middlewareManager.register(middleware);
  }

  const formatterRegistry = new FormattersRegistry();
  const baseFormatters: OutputFormatter[] = [
    jsonFormatter,
    yamlFormatter,
    tableFormatter,
    markdownFormatter,
  ];
  for (const formatter of [...baseFormatters, ...(formatters ?? [])]) {
    formatterRegistry.register(formatter);
  }

  return {
    context,
    middleware: middlewareManager,
    formatters: formatterRegistry,
    registerMiddleware(middleware: MiddlewareConfig) {
      middlewareManager.register(middleware);
    },
    registerFormatter(formatter: OutputFormatter) {
      formatterRegistry.register(formatter);
    },
  };
}

