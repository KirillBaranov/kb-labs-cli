import type { Command } from "../../types";
import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { runPreflightChecks } from '@kb-labs/sandbox';
import { getContextCwd } from '../../utils/context.js';

const ALL_SECTIONS = ['workspace', 'discovery', 'packages', 'cache', 'env', 'mind', 'sandbox'] as const;
type Section = typeof ALL_SECTIONS[number];
type Status = 'ok' | 'warn' | 'fail';

interface Issue {
  code: string;
  severity: 'warn' | 'fail';
  section: string;
  message: string;
  hint?: string;
}

interface CheckResult {
  status: Status;
  issues: Issue[];
  timingMs: number;
}

interface DoctorResult {
  checks: Partial<Record<Section, Status>>;
  issues: Issue[];
  timingMs: Partial<Record<Section | 'total', number>>;
  fix?: {
    applied: string[];
    skipped: string[];
    needsConfirm: string[];
  };
}

export const doctor: Command = {
  name: "doctor",
  category: "system",
  describe: "Comprehensive workspace health check",
  longDescription: "Diagnoses workspace, plugins, packages, cache, environment, and Mind indexes",
  examples: [
    "kb doctor",
    "kb doctor --json",
    "kb doctor --only=env,cache",
    "kb doctor --fix --yes"
  ],
  async run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    const quiet = !!flags.quiet;
    
    // Parse filter flags
    const onlySections = typeof flags.only === 'string' 
      ? flags.only.split(',').map(s => s.trim()) as Section[]
      : null;
    const skipSections = typeof flags.skip === 'string'
      ? flags.skip.split(',').map(s => s.trim()) as Section[]
      : [];
    
    // Parse fix flags
    const doFix = !!flags.fix;
    const fixScopes = typeof flags.fix === 'string'
      ? flags.fix.split(',').map(s => s.trim())
      : doFix ? ['cache'] : [];
    const autoYes = !!flags.yes;
    
    const debugMode = Boolean(flags.debug);
    const cwd = typeof ctx?.repoRoot === 'string' && ctx.repoRoot.length > 0
      ? ctx.repoRoot
      : getContextCwd(ctx as { cwd?: string });
    
    try {
      const result: DoctorResult = {
        checks: {},
        issues: [],
        timingMs: { total: 0 }
      };
      
      // Run checks
      for (const section of ALL_SECTIONS) {
        if (onlySections && !onlySections.includes(section)) {
          continue;
        }
        if (skipSections.includes(section)) {
          continue;
        }
        
        tracker.checkpoint(section);
        const check = await runCheck(section, cwd, debugMode);
        result.checks[section] = check.status;
        result.issues.push(...check.issues);
        result.timingMs[section] = check.timingMs;
      }
      
      result.timingMs.total = tracker.total();
      
      // Determine overall status
      const hasFail = result.issues.some(i => i.severity === 'fail');
      const overallOk = !hasFail;
      
      // Apply fixes if requested
      if (doFix && Object.keys(result.checks).length > 0) {
        const fixResult = await applyFixes(cwd, fixScopes, autoYes, quiet);
        result.fix = fixResult;
      }
      
      // Output
      if (jsonMode) {
        ctx.presenter.json({
          ok: overallOk,
          ...result
        });
      } else {
        const summaryLines: string[] = [];
        
        // Add check statuses
        const statusDisplay: Record<string, string> = {};
        for (const [section, status] of Object.entries(result.checks)) {
          const icon = status === 'ok' ? safeSymbols.success :
                      status === 'warn' ? safeSymbols.warning :
                      safeSymbols.error;
          const capitalized = section.charAt(0).toUpperCase() + section.slice(1);
          statusDisplay[capitalized.padEnd(14)] = `${icon} ${status}`;
        }
        
        summaryLines.push(...keyValue(statusDisplay));
        
        // Add issues if any
        if (result.issues.length > 0) {
          summaryLines.push('', safeColors.dim('Issues Found:'));
          for (const issue of result.issues) {
            const icon = issue.severity === 'fail' ? safeSymbols.error : safeSymbols.warning;
            summaryLines.push(`  ${icon} ${issue.code}: ${issue.message}`);
            if (issue.hint) {
              summaryLines.push(`    ${safeColors.dim('→')} ${issue.hint}`);
            }
          }
        }
        
        // Add fix summary if applied
        if (result.fix) {
          summaryLines.push('');
          if (result.fix.applied.length > 0) {
            summaryLines.push(safeColors.success(`✓ Fixed: ${result.fix.applied.join(', ')}`));
          }
          if (result.fix.needsConfirm.length > 0) {
            summaryLines.push(safeColors.warning(`⚠ Needs confirmation: ${result.fix.needsConfirm.join(', ')}`));
          }
        }
        
        const output = box('System Health Check', [
          ...summaryLines,
          '',
          safeColors.dim(`Time: ${formatTiming(result.timingMs.total)}`)
        ]);
        ctx.presenter.write(output);
      }
      
      return hasFail ? 1 : 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage, timing: tracker.total() });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};

async function runCheck(section: Section, cwd: string, debugMode: boolean): Promise<CheckResult> {
  const start = Date.now();
  const issues: Issue[] = [];
  
  switch (section) {
    case 'workspace':
      await checkWorkspace(cwd, issues);
      break;
    case 'discovery':
      await checkDiscovery(cwd, issues);
      break;
    case 'packages':
      await checkPackages(cwd, issues);
      break;
    case 'cache':
      await checkCache(cwd, issues);
      break;
    case 'env':
      checkEnv(issues);
      break;
    case 'mind':
      await checkMind(cwd, issues);
      break;
    case 'sandbox':
      await checkSandbox(cwd, issues, debugMode);
      break;
  }
  
  const status: Status = issues.some(i => i.severity === 'fail') ? 'fail' :
                        issues.length > 0 ? 'warn' : 'ok';
  
  return { status, issues, timingMs: Date.now() - start };
}

async function checkWorkspace(cwd: string, issues: Issue[]): Promise<void> {
  const kbDir = join(cwd, '.kb');
  if (!existsSync(kbDir)) {
    issues.push({
      code: 'WORKSPACE_NO_KB_DIR',
      severity: 'warn',
      section: 'workspace',
      message: '.kb directory not found',
      hint: 'Will be created automatically'
    });
  }
  
  const gitDir = join(cwd, '.git');
  if (!existsSync(gitDir)) {
    issues.push({
      code: 'WORKSPACE_NO_GIT',
      severity: 'warn',
      section: 'workspace',
      message: 'Not a git repository',
      hint: 'Initialize with: git init'
    });
  }
}

async function checkDiscovery(cwd: string, issues: Issue[]): Promise<void> {
  const cacheDir = join(cwd, '.kb', 'cache');
  if (!existsSync(cacheDir)) {
    return;
  }
  
  const cacheFile = join(cacheDir, 'cli-manifests.json');
  if (existsSync(cacheFile)) {
    try {
      const stat = statSync(cacheFile);
      const age = Date.now() - stat.mtimeMs;
      if (age > 60000) {
        issues.push({
          code: 'DISCOVERY_CACHE_STALE',
          severity: 'warn',
          section: 'discovery',
          message: 'Cache is stale',
          hint: 'Run: kb plugins cache clear'
        });
      }
    } catch {
      issues.push({
        code: 'DISCOVERY_CACHE_INVALID',
        severity: 'warn',
        section: 'discovery',
        message: 'Cache file corrupted',
        hint: 'Run: kb plugins cache clear'
      });
    }
  }
}

async function checkPackages(cwd: string, issues: Issue[]): Promise<void> {
  const workspaceYaml = join(cwd, 'pnpm-workspace.yaml');
  if (!existsSync(workspaceYaml)) {
    // Not an issue - single package workspaces don't need this
  }
}

async function checkCache(cwd: string, issues: Issue[]): Promise<void> {
  const cacheDir = join(cwd, '.kb', 'cache');
  if (existsSync(cacheDir)) {
    try {
      await fs.readdir(cacheDir);
    } catch {
      issues.push({
        code: 'CACHE_DIR_ERROR',
        severity: 'warn',
        section: 'cache',
        message: 'Cannot read cache directory',
        hint: 'Check permissions'
      });
    }
  }
}

function checkEnv(issues: Issue[]): void {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0] || '0');
  
  if (major < 18) {
    issues.push({
      code: 'ENV_NODE_VERSION',
      severity: 'fail',
      section: 'env',
      message: `Node version ${nodeVersion} is too old`,
      hint: 'Requires Node.js >= 18.18.0'
    });
  }
}

async function checkMind(cwd: string, issues: Issue[]): Promise<void> {
  // Only check if .kb/mind directory exists
  // If it doesn't exist, skip the check (workspace doesn't use mind)
  const mindDir = join(cwd, '.kb', 'mind');
  
  if (!existsSync(mindDir)) {
    // Mind directory doesn't exist - skip check (not using mind in this workspace)
    return;
  }
  
  // Mind directory exists, check if properly initialized
  const indexFile = join(mindDir, 'index.json');
  if (!existsSync(indexFile)) {
    issues.push({
      code: 'MIND_INCOMPLETE',
      severity: 'warn',
      section: 'mind',
      message: 'Mind directory exists but indexes not initialized',
      hint: 'Initialize mind indexes'
    });
    return;
  }
  
  // Check if index file is valid JSON
  try {
    const content = await fs.readFile(indexFile, 'utf8');
    const index = JSON.parse(content);
    if (!index.schemaVersion || !index.updatedAt) {
      issues.push({
        code: 'MIND_INVALID',
        severity: 'warn',
        section: 'mind',
        message: 'Mind index file is invalid',
        hint: 'Reinitialize mind indexes'
      });
    }
  } catch {
    issues.push({
      code: 'MIND_CORRUPTED',
      severity: 'warn',
      section: 'mind',
      message: 'Mind index file is corrupted',
      hint: 'Reinitialize mind indexes'
    });
  }
}

async function applyFixes(
  cwd: string,
  scopes: string[],
  autoYes: boolean,
  quiet: boolean
): Promise<{ applied: string[]; skipped: string[]; needsConfirm: string[] }> {
  const result = {
    applied: [] as string[],
    skipped: [] as string[],
    needsConfirm: [] as string[]
  };
  
  for (const scope of scopes) {
    switch (scope) {
      case 'cache':
        try {
          const cacheDir = join(cwd, '.kb', 'cache');
          if (existsSync(cacheDir)) {
            const entries = await fs.readdir(cacheDir);
            for (const entry of entries) {
              await fs.unlink(join(cacheDir, entry));
            }
          }
          result.applied.push('cache');
        } catch (error) {
          result.skipped.push(`cache: ${error instanceof Error ? error.message : 'unknown'}`);
        }
        break;
        
      case 'artifacts':
        result.needsConfirm.push('artifacts');
        break;
    }
  }
  
  return result;
}

async function checkSandbox(cwd: string, issues: Issue[], debug: boolean = false): Promise<void> {
  try {
    const result = await runPreflightChecks(debug);
    
    for (const check of result.checks) {
      if (!check.passed) {
        issues.push({
          code: `SANDBOX_${check.name.toUpperCase().replace(/\s+/g, '_')}`,
          severity: 'fail',
          section: 'sandbox',
          message: check.error || check.name,
          hint: check.suggestions && check.suggestions.length > 0 
            ? check.suggestions.join('; ') 
            : undefined,
        });
      }
    }
  } catch (error) {
    issues.push({
      code: 'SANDBOX_CHECK_ERROR',
      severity: 'fail',
      section: 'sandbox',
      message: error instanceof Error ? error.message : 'Failed to run sandbox checks',
      hint: 'Check that @kb-labs/sandbox is properly installed',
    });
  }
} 