import type { Presenter } from "./presenter/types";
import path from "node:path";
import { existsSync } from "node:fs";

/** Very small repo root detector: looks for .git upwards. */
function detectRepoRoot(start = process.cwd()): string {
  let cur = path.resolve(start);
  while (true) {
    if (existsSync(path.join(cur, ".git"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      return start;
    } // fallback
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
  logger?: Logger;
  presenter: Presenter;
  env: NodeJS.ProcessEnv;
  profile?: Profile; // команды могут просить профиль отдельно
  config?: Record<string, any>; // конфигурация
  diagnostics: string[];     // NEW: собираем WARN/INFO для JSON
  sentJSON?: boolean;        // NEW: флаг что команда сама вывела JSON
}

export async function createContext({
  presenter,
  logger,
}: {
  presenter: Presenter;
  logger?: Logger;
}): Promise<CliContext> {
  // вычисли repoRoot
  const repoRoot = detectRepoRoot();

  // loadConfig - пока заглушка, так как функция не найдена в монорепе
  const config = {}; // TODO: загрузить конфигурацию когда появится loadConfig

  return {
    presenter,
    logger,
    config,
    repoRoot,
    env: process.env,
    diagnostics: [],         // NEW
    sentJSON: false,        // NEW
  };
}
