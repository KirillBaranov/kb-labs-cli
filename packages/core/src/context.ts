import type { Presenter } from "./presenter/types";
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

export interface Logger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
}

export interface Profile {
  name: string;
  [key: string]: any;
}

export interface CliContext {
  repoRoot?: string;
  cwd: string;
  logger?: Logger;
  presenter: Presenter;
  env: NodeJS.ProcessEnv;
  profile?: Profile;
  config?: Record<string, any>;
  diagnostics: string[];
  sentJSON?: boolean;
}

export interface CreateContextOptions {
  presenter: Presenter;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  repoRoot?: string;
  config?: Record<string, any>;
}

export async function createContext({
  presenter,
  logger,
  env,
  cwd,
  repoRoot,
  config = {},
}: CreateContextOptions): Promise<CliContext> {
  const resolvedEnv = env ?? process.env;
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedRepoRoot = repoRoot ?? detectRepoRoot(resolvedCwd);

  return {
    presenter,
    logger,
    config,
    repoRoot: resolvedRepoRoot,
    cwd: resolvedCwd,
    env: resolvedEnv,
    diagnostics: [],
    sentJSON: false,
  };
}
