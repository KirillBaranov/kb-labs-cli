import type { Presenter } from "@kb-labs/cli-contracts";
import { createContext, type Logger, type SystemContext } from "@kb-labs/cli-core";

export interface RuntimeContextOptions {
  presenter: Presenter;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  repoRoot?: string;
  config?: Record<string, any>;
}

export async function createRuntimeContext(
  options: RuntimeContextOptions,
): Promise<SystemContext> {
  return createContext({
    presenter: options.presenter,
    logger: options.logger,
    env: options.env,
    cwd: options.cwd,
    repoRoot: options.repoRoot,
    config: options.config,
  });
}
