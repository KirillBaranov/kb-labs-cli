import type { CliContext } from '@kb-labs/cli-core';

export function getContextCwd(ctx: Partial<CliContext> & { cwd?: string }): string {
  if (typeof ctx.cwd === 'string' && ctx.cwd.length > 0) {
    return ctx.cwd;
  }
  return process.cwd();
}
