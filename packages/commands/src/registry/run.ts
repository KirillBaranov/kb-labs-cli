/**
 * @kb-labs/cli-commands/registry
 * Command execution with lazy loading and global flags passthrough
 */

import type { RegisteredCommand } from './types.js';

// Global flags that are always passed to commands
const GLOBAL_FLAGS = ['json', 'onlyAvailable', 'noCache', 'verbose', 'quiet', 'help', 'version'];

/**
 * Execute a registered command with lazy loading
 * @param cmd Registered command
 * @param ctx CLI context
 * @param argv Command arguments
 * @param flags Parsed flags
 * @returns Exit code (0=success, 1=error, 2=unavailable)
 */
export async function runCommand(
  cmd: RegisteredCommand,
  ctx: any,
  argv: string[],
  flags: Record<string, any>
): Promise<number> {
  // LAZY EVALUATION PIPELINE:
  // Stage 1: Check availability (resolve only, no imports)
  // Stage 2: Load command module (actual import happens here)
  // Stage 3: Execute command
  
  // Check availability
  if (!cmd.available) {
    // JSON mode: structured response with exact spec format
    if (flags.json) {
      ctx.presenter.json({
        ok: false,
        available: false,
        command: cmd.manifest.id,
        reason: cmd.unavailableReason,
        hint: cmd.hint,
      });
      return 2;
    }
    
    // Text mode: formatted error
    const verbose = flags.verbose || false;
    if (verbose) {
      ctx.presenter.warn(`Command unavailable: ${cmd.manifest.id}`);
      ctx.presenter.warn(`Reason: ${cmd.unavailableReason}`);
      if (cmd.hint) {ctx.presenter.info(`Hint: ${cmd.hint}`);}
    } else {
      ctx.presenter.warn(`${cmd.manifest.id} unavailable: ${cmd.unavailableReason}`);
      if (cmd.hint) {ctx.presenter.info(cmd.hint);}
    }
    return 2;
  }
  
  // Stage 2: Load command module (actual import happens here)
  let mod: any;
  try {
    mod = await cmd.manifest.loader();
  } catch (error: any) {
    ctx.presenter.error(`Failed to load command ${cmd.manifest.id}: ${error.message}`);
    return 1;
  }
  
  // Validate module has run function
  if (!mod?.run || typeof mod.run !== 'function') {
    ctx.presenter.error(`Invalid command module for ${cmd.manifest.id}: missing run function`);
    return 1;
  }
  
  // Ensure global flags are always passed through
  const allFlags = { ...flags };
  for (const flag of GLOBAL_FLAGS) {
    if (flag in flags) {
      allFlags[flag] = flags[flag];
    }
  }
  
  // Stage 3: Execute command
  try {
    const result = await mod.run(ctx, argv, allFlags);
    return typeof result === 'number' ? result : 0;
  } catch (error: any) {
    ctx.presenter.error(`Command ${cmd.manifest.id} failed: ${error.message}`);
    return 1;
  }
}

