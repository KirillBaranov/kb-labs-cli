/**
 * @kb-labs/cli-commands/registry
 * Command execution with lazy loading, timeouts, guards, and permissions
 */

import type { RegisteredCommand } from './types.js';
import { loadPluginsState } from './plugins-state.js';
import { telemetry } from './telemetry.js';

// Global flags that are always passed to commands
const GLOBAL_FLAGS = ['json', 'onlyAvailable', 'noCache', 'verbose', 'debug', 'quiet', 'help', 'version', 'dryRun'];

// Execution limits
const COMMAND_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Check if plugin has required permissions
 */
async function checkPermissions(
  cmd: RegisteredCommand,
  cwd: string
): Promise<{ allowed: boolean; reason?: string }> {
  const requiredPermissions = cmd.manifest.permissions || [];
  
  if (requiredPermissions.length === 0) {
    return { allowed: true };
  }
  
  const state = await loadPluginsState(cwd);
  const grantedPermissions = state.permissions[cmd.manifest.package || cmd.manifest.group] || [];
  
  // Default permissions for 3rd-party plugins
  const defaultPermissions = ['fs.read'];
  const allGranted = [...defaultPermissions, ...grantedPermissions];
  
  const missing = requiredPermissions.filter(p => !allGranted.includes(p));
  
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: `Missing permissions: ${missing.join(', ')}. Run: kb plugins enable ${cmd.manifest.package || cmd.manifest.group} --perm ${missing.join(' --perm ')}`,
    };
  }
  
  return { allowed: true };
}

/**
 * Execute a registered command with lazy loading, timeouts, and guards
 */
export async function runCommand(
  cmd: RegisteredCommand,
  ctx: any,
  argv: string[],
  flags: Record<string, any>
): Promise<number> {
  // Check availability
  if (!cmd.available) {
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
  
  // Check permissions
  const permissionsCheck = await checkPermissions(cmd, ctx.cwd || process.cwd());
  if (!permissionsCheck.allowed) {
    if (flags.json) {
      ctx.presenter.json({
        ok: false,
        available: false,
        command: cmd.manifest.id,
        reason: permissionsCheck.reason,
        hint: `Grant required permissions or enable plugin`,
      });
      return 2;
    }
    
    ctx.presenter.error(`${cmd.manifest.id}: ${permissionsCheck.reason}`);
    return 2;
  }
  
  // For ManifestV2 commands, skip loader (handler is executed via plugin-adapter-cli)
  // Check if this is a ManifestV2 command
  const isManifestV2 = !!(cmd.manifest as any).manifestV2;
  
  // Load command module (skip for ManifestV2 - they use executeCommand directly)
  let mod: any;
  if (!isManifestV2) {
    try {
      mod = await cmd.manifest.loader();
    } catch (error: any) {
      // Record crash for quarantine
      const { recordCrash } = await import('./plugins-state.js');
      await recordCrash(ctx.cwd || process.cwd(), cmd.manifest.package || cmd.manifest.group);
      
      ctx.presenter.error(`Failed to load command ${cmd.manifest.id}: ${error.message}`);
      return 1;
    }
    
    if (!mod?.run || typeof mod.run !== 'function') {
      ctx.presenter.error(`Invalid command module for ${cmd.manifest.id}: missing run function`);
      return 1;
    }
  }
  
  // Ensure global flags are always passed through
  const allFlags = { ...flags };
  for (const flag of GLOBAL_FLAGS) {
    if (flag in flags) {
      allFlags[flag] = flags[flag];
    }
  }
  
  // Execute command with timeout
  const execStart = Date.now();
  try {
    // For ManifestV2 commands, use executeCommand directly (from utils/registry.ts)
    // For legacy commands, use mod.run
    const executionPromise = isManifestV2 
      ? (async () => {
          // Import executeCommand from utils/registry
          const { executeCommand } = await import('../utils/registry.js');
          const manifestV2 = (cmd.manifest as any).manifestV2;
          const commandId = cmd.manifest.id.split(':').pop() || cmd.manifest.id;
          const cliCommand = manifestV2.cli?.commands?.find((c: any) => 
            c.id === commandId || c.id === cmd.manifest.id
          );
          if (!cliCommand) {
            throw new Error(`Command ${cmd.manifest.id} not found in manifest`);
          }
          return await executeCommand(
            cliCommand,
            manifestV2,
            ctx,
            allFlags,
            manifestV2.capabilities || [],
            cmd.pkgRoot,
            process.cwd(),
            undefined,
            undefined
          );
        })()
      : mod.run(ctx, argv, allFlags);
    
    const timeoutPromise = new Promise<number>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Command execution timeout after ${COMMAND_TIMEOUT / 1000}s`));
      }, COMMAND_TIMEOUT);
    });
    
    const result = await Promise.race([executionPromise, timeoutPromise]);
    const execDuration = Date.now() - execStart;
    
    // Record telemetry
    telemetry.recordExecution({
      commandId: cmd.manifest.id,
      duration: execDuration,
      success: true,
    });
    
    return typeof result === 'number' ? result : 0;
  } catch (error: any) {
    const execDuration = Date.now() - execStart;
    
    // Enhanced crash report
    const crashReport = {
      commandId: cmd.manifest.id,
      package: cmd.manifest.package || cmd.manifest.group,
      version: process.env.CLI_VERSION || '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      error: {
        code: error.code || 'UNKNOWN',
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 10).join('\n'), // First 10 lines of stack
        hint: error.message.includes('timeout') 
          ? 'Command exceeded timeout limit. Consider optimizing or using --no-timeout'
          : error.message.includes('Cannot find module')
          ? 'Missing dependency. Run: pnpm install'
          : 'Check command implementation and dependencies',
      },
      timestamp: new Date().toISOString(),
    };
    
    // Log crash report in verbose mode
    if (ctx.logger?.level === 'debug' || ctx.logger?.level === 'verbose') {
      ctx.logger.debug(`[crash-report] ${JSON.stringify(crashReport, null, 2)}`);
    }
    
    // Record crash for quarantine
    const { recordCrash } = await import('./plugins-state.js');
    await recordCrash(ctx.cwd || process.cwd(), cmd.manifest.package || cmd.manifest.group);
    
    // Record telemetry
    telemetry.recordExecution({
      commandId: cmd.manifest.id,
      duration: execDuration,
      success: false,
      errorCode: error.code || 'UNKNOWN',
    });
    
    ctx.presenter.error(`Command ${cmd.manifest.id} failed: ${error.message}`);
    
    if (error.message.includes('timeout')) {
      ctx.presenter.warn(`Command exceeded timeout limit. Consider optimizing the command.`);
    }
    
    // Show hint if available
    if (crashReport.error.hint && crashReport.error.hint !== 'Check command implementation and dependencies') {
      ctx.presenter.info(`Hint: ${crashReport.error.hint}`);
    }
    
    return 1;
  }
}

