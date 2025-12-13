// V2: Export PluginContextV2 as primary type
export type { PluginContextV2 } from "@kb-labs/plugin-runtime";
// Re-export for backward compatibility
export type { Profile, Logger } from "@kb-labs/cli-contracts";

import type { Presenter } from "@kb-labs/cli-contracts";
import type { Output } from "@kb-labs/core-sys/output";
import type { Logger as CoreLogger } from "@kb-labs/core-sys/logging";
import {
  createPluginContextWithPlatform,
  createId,
  type PluginContextV2,
  type UIFacade,
  CliUIFacade,
} from "@kb-labs/plugin-runtime";
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

// Local type definitions for UI facade helpers
type ColorFn = (text: string) => string;
interface UIColors {
  success: ColorFn; error: ColorFn; warning: ColorFn; info: ColorFn;
  primary: ColorFn; accent: ColorFn; highlight: ColorFn; secondary: ColorFn;
  emphasis: ColorFn; muted: ColorFn; foreground: ColorFn;
  dim: ColorFn; bold: ColorFn; underline: ColorFn; inverse: ColorFn;
}
interface UISymbols {
  success: string; error: string; warning: string; info: string;
  bullet: string; pointer: string; separator: string; border: string;
}

/**
 * Create UIFacade for CLI context.
 * Uses CliUIFacade which provides full UI API with formatting.
 */
function createCliUIFacade(verbosity: 'quiet' | 'normal' | 'verbose', jsonMode: boolean): UIFacade {
  return new CliUIFacade({ verbosity, jsonMode });
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
  verbosity?: 'quiet' | 'normal' | 'verbose';
  jsonMode?: boolean;
}

/**
 * Create PluginContextV2 for system commands
 *
 * This creates a PURE V2 context with all required fields.
 * Legacy fields (repoRoot, profileId, env) are moved to metadata.
 */
export async function createContext({
  presenter,
  logger,
  output,
  env,
  cwd,
  repoRoot,
  config = {},
  profileId,
  verbosity = 'normal',
  jsonMode = false,
}: CreateContextOptions): Promise<PluginContextV2> {
  const resolvedEnv = env ?? process.env;
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedRepoRoot = repoRoot ?? detectRepoRoot(resolvedCwd);

  // Create UI Facade with proper verbosity and json mode
  const uiFacade = createCliUIFacade(verbosity, jsonMode);

  // Create PURE PluginContextV2 - no legacy fields at top level
  return createPluginContextWithPlatform({
    host: 'cli',
    requestId: createId(),
    pluginId: '@kb-labs/cli-core',
    pluginVersion: process.env.CLI_VERSION || '0.1.0',
    tenantId: process.env.KB_TENANT_ID ?? 'default',
    cwd: resolvedCwd,        // V2: top-level
    outdir: undefined,        // V2: top-level (not set for system commands)
    ui: uiFacade,             // V2: primary output API (adapted from presenter)
    output,                   // V2: output adapter for backward compat (promoted from metadata)
    config,                   // V2: typed config
    metadata: {
      // CLI-specific metadata (legacy fields moved here)
      repoRoot: resolvedRepoRoot,
      profileId,
      env: resolvedEnv,
      // Logger if provided
      logger,
    },
  });
}
