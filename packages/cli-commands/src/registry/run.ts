import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import type { RegisteredCommand } from './types';

/**
 * Execute a registered command.
 *
 * - Unavailable commands return exit code 2 with structured error output.
 * - Available commands are delegated to plugin-adapter-cli executeCommand.
 */
export async function runCommand(
  cmd: RegisteredCommand,
  ctx: any,
  argv: string[],
  flags: Record<string, any>,
): Promise<number> {
  if (!cmd.available) {
    if (ctx.presenter?.json) {
      ctx.presenter.json({
        ok: false,
        available: false,
        command: cmd.manifest.id,
        reason: cmd.unavailableReason,
        hint: cmd.hint,
      });
    }
    return 2;
  }

  const implementation = await cmd.manifest.loader();
  const result = await executeCommand(
    cmd.v3Manifest ?? cmd.manifest.manifestV2,
    implementation,
    ctx,
    flags,
  );

  return typeof result === 'number' ? result : 0;
}
