/**
 * @kb-labs/cli-commands/registry
 * Command execution with lazy loading, timeouts, guards, and permissions
 */

import type { RegisteredCommand } from './types';
import { loadPluginsState } from './plugins-state';
import { telemetry } from './telemetry';
import { executeCommand } from '@kb-labs/plugin-contracts';
import { getContextCwd } from '../utils/context';

// Global flags that are always passed to commands
const GLOBAL_FLAGS = ['json', 'onlyAvailable', 'noCache', 'verbose', 'debug', 'quiet', 'help', 'version', 'dryRun', 'yes'];

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
    ctx.logger?.warn('Command unavailable', { 
      command: cmd.manifest.id, 
      reason: cmd.unavailableReason,
      hint: cmd.hint,
    });
    
    if (flags.json) {
      ctx.output?.json({
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
      ctx.output?.warn(`Command unavailable: ${cmd.manifest.id}`);
      ctx.output?.warn(`Reason: ${cmd.unavailableReason}`);
      if (cmd.hint) {ctx.output?.info(`Hint: ${cmd.hint}`);}
    } else {
      ctx.output?.warn(`${cmd.manifest.id} unavailable: ${cmd.unavailableReason}`);
      if (cmd.hint) {ctx.output?.info(cmd.hint);}
    }
    return 2;
  }
  
  // Check permissions
  const currentCwd = getContextCwd(ctx as { cwd?: string });

  const permissionsCheck = await checkPermissions(cmd, currentCwd);
  if (!permissionsCheck.allowed) {
    ctx.logger?.warn('Command permissions denied', {
      command: cmd.manifest.id,
      reason: permissionsCheck.reason,
    });
    
    if (flags.json) {
      ctx.output?.json({
        ok: false,
        available: false,
        command: cmd.manifest.id,
        reason: permissionsCheck.reason,
        hint: `Grant required permissions or enable plugin`,
      });
      return 2;
    }
    
    ctx.output?.error(new Error(`${cmd.manifest.id}: ${permissionsCheck.reason}`));
    return 2;
  }
  
  // For ManifestV3 commands, skip loader (handler is executed via plugin-adapter-cli)
  // Check if this is a ManifestV3 command
  const isManifestV3 = !!(cmd.manifest as any).manifestV2;
  
  const manifestV2 = (cmd.manifest as any).manifestV2;
  if (!manifestV2) {
    ctx.logger?.error('Command must be defined via ManifestV3', { command: cmd.manifest.id });
    ctx.output?.error(new Error(`Command ${cmd.manifest.id} must be defined via ManifestV3`));
    return 1;
  }
  
  // ID is now simple (no namespace prefix)
  const commandId = cmd.manifest.id;
  const cliCommand = manifestV2.cli?.commands?.find((c: any) =>
    c.id === commandId
  );
  if (!cliCommand) {
    ctx.logger?.error('Command not declared in manifest', { command: cmd.manifest.id });
    ctx.output?.error(new Error(`Command ${cmd.manifest.id} not declared in manifest`));
    return 1;
  }
  
  const allFlags = { ...flags };
  for (const flag of GLOBAL_FLAGS) {
    if (flag in flags) {
      allFlags[flag] = flags[flag];
    }
  }
  
  const execStart = Date.now();
  try {
    const executionPromise = (async () => {
      return await executeCommand(
        cliCommand,
        manifestV2,
        ctx,
        allFlags,
        manifestV2.capabilities || [],
        cmd.pkgRoot,
        currentCwd,
        undefined,
        undefined
      );
    })();
    
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
    
    // Log crash report in debug mode
    ctx.logger?.debug('Crash report', { crashReport });
    
    // Record crash for quarantine
    const { recordCrash } = await import('./plugins-state');
    await recordCrash(currentCwd, cmd.manifest.package || cmd.manifest.group);
    
    // Record telemetry
    telemetry.recordExecution({
      commandId: cmd.manifest.id,
      duration: execDuration,
      success: false,
      errorCode: error.code || 'UNKNOWN',
    });
    
    ctx.logger?.error('Command execution failed', {
      command: cmd.manifest.id,
      error: error.message,
      code: error.code,
    });
    
    ctx.output?.error(error instanceof Error ? error : new Error(error.message));
    
    if (error.message.includes('timeout')) {
      ctx.output?.warn(`Command exceeded timeout limit. Consider optimizing the command.`);
    }
    
    // Show hint if available
    if (crashReport.error.hint && crashReport.error.hint !== 'Check command implementation and dependencies') {
      ctx.output?.info(`Hint: ${crashReport.error.hint}`);
    }
    
    return 1;
  }
}

