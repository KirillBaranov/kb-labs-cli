// Re-export types from cli-contracts (source of truth)
export type { CliContext, Profile, Logger } from "@kb-labs/cli-contracts";

import type { CliContext, Presenter } from "@kb-labs/cli-contracts";
import type { Output } from "@kb-labs/core-sys/output";
import type { Logger as CoreLogger } from "@kb-labs/core-sys/logging";
import path from "node:path";
import { existsSync } from "node:fs";

function detectRepoRoot(start: string): string {
  let cur = path.resolve(start);
  while (true) {
    if (existsSync(path.join(cur, ".git"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      return start;
    }
    cur = parent;
  }
}

export interface CreateContextOptions {
  presenter: Presenter;
  logger?: CoreLogger;
  output?: Output;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  repoRoot?: string;
  config?: Record<string, any>;
  profileId?: string;
}

export async function createContext({
  presenter,
  logger,
  output,
  env,
  cwd,
  repoRoot,
  config = {},
  profileId,
}: CreateContextOptions): Promise<CliContext> {
  const resolvedEnv = env ?? process.env;
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedRepoRoot = repoRoot ?? detectRepoRoot(resolvedCwd);

  return {
    presenter,
    logger,
    output,
    config,
    repoRoot: resolvedRepoRoot,
    cwd: resolvedCwd,
    env: resolvedEnv,
    profileId,
    diagnostics: [],
    sentJSON: false,
  };
}
