import { promises as fs } from "fs";
import { join, dirname } from "path";
import { colors } from "@kb-labs/cli-core";

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to the last plan file
 */
export function getLastPlanPath(rootDir: string = process.cwd()): string {
  return join(rootDir, '.kb', 'devlink', 'last-plan.json');
}

/**
 * Get the path to the lock file
 */
export function getLockFilePath(rootDir: string = process.cwd(), lockFile?: string): string {
  if (lockFile) {
    return lockFile;
  }
  return join(rootDir, '.kb', 'devlink', 'lock.json');
}

/**
 * Write last plan to file
 */
export async function writeLastPlan(plan: any, rootDir: string = process.cwd()): Promise<string> {
  const planPath = getLastPlanPath(rootDir);
  const planDir = dirname(planPath);

  await ensureDir(planDir);
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8');

  return planPath;
}

/**
 * Read last plan from file
 */
export async function readLastPlan(rootDir: string = process.cwd()): Promise<any> {
  const planPath = getLastPlanPath(rootDir);

  if (!await fileExists(planPath)) {
    throw new Error(`No plan found at ${planPath}. Run 'devlink:plan' first.`);
  }

  const content = await fs.readFile(planPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Read plan from stdin
 */
export async function readPlanFromStdin(): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      try {
        const plan = JSON.parse(data);
        resolve(plan);
      } catch (error) {
        reject(new Error('Failed to parse plan from stdin: ' + (error as Error).message));
      }
    });

    process.stdin.on('error', (error) => {
      reject(error);
    });
  });
}

interface TableRow {
  target: string;
  dep: string;
  kind: string;
  reason: string;
}

/**
 * Print table for human-readable output
 */
export function printTable(rows: TableRow[]): string {
  if (rows.length === 0) {
    return 'No items to display.\n';
  }

  // Calculate column widths
  const widths = {
    target: Math.max(6, ...rows.map(r => r.target.length)),
    dep: Math.max(3, ...rows.map(r => r.dep.length)),
    kind: Math.max(4, ...rows.map(r => r.kind.length)),
    reason: Math.max(6, ...rows.map(r => r.reason.length))
  };

  // Create separator
  const separator = `+-${'-'.repeat(widths.target)}-+-${'-'.repeat(widths.dep)}-+-${'-'.repeat(widths.kind)}-+-${'-'.repeat(widths.reason)}-+\n`;

  // Header
  let output = separator;
  output += `| ${'Target'.padEnd(widths.target)} | ${'Dep'.padEnd(widths.dep)} | ${'Kind'.padEnd(widths.kind)} | ${'Reason'.padEnd(widths.reason)} |\n`;
  output += separator;

  // Rows
  for (const row of rows) {
    output += `| ${row.target.padEnd(widths.target)} | ${row.dep.padEnd(widths.dep)} | ${row.kind.padEnd(widths.kind)} | ${row.reason.padEnd(widths.reason)} |\n`;
  }

  output += separator;
  return output;
}

/**
 * Format summary for results
 */
export interface ResultSummary {
  executed: number;
  skipped: number;
  errors: number;
}

export function formatSummary(summary: ResultSummary): string {
  let output = '\n' + colors.bold('Summary:') + '\n';
  output += `  ${colors.green('✓')} Executed: ${summary.executed}\n`;
  output += `  ${colors.yellow('⊘')} Skipped:  ${summary.skipped}\n`;
  output += `  ${colors.red('✗')} Errors:   ${summary.errors}\n`;
  return output;
}

/**
 * Format footer message based on operation results
 */
export function formatFooter(summary: ResultSummary, duration: number, hasWarnings: boolean = false): string {
  if (summary.errors > 0) {
    return `\n${colors.red('✗')} ${colors.red('Completed with errors.')}\n`;
  }

  if (hasWarnings || summary.skipped > 0) {
    return `\n${colors.yellow('⚠')} ${colors.yellow('Completed with warnings.')} ⏱ ${colors.dim(`${duration}ms`)}\n`;
  }

  return `\n${colors.green('🌟')} ${colors.green('All operations completed successfully!')} ⏱ ${colors.dim(`${duration}ms`)}\n`;
}

/**
 * Format footer for cancelled operations
 */
export function formatCancelledFooter(duration: number): string {
  return `\n${colors.yellow('⚠')} ${colors.yellow('Cancelled by preflight.')} ⏱ ${colors.dim(`${duration}ms`)}\n`;
}

/**
 * Format preflight diagnostics with enhanced display
 */
export function formatPreflightDiagnostics(diagnostics: string[], wasCancelled: boolean = false, wasForced: boolean = false): string {
  if (diagnostics.length === 0) {
    return "";
  }

  let output = "";

  if (wasCancelled && !wasForced) {
    output += `\n${colors.yellow('✋')} ${colors.yellow('Operation cancelled by preflight checks')}\n`;
  } else if (wasForced) {
    output += `\n${colors.green('Proceeding anyway due to --yes flag.')} ${colors.dim('(green)')}\n`;
  }

  output += `\n${colors.cyan('📝 Diagnostics:')}\n`;
  for (const diag of diagnostics) {
    // Format file paths in diagnostics
    const formattedDiag = diag.replace(/\/[^\s]+/g, (path) => colors.dim(path));
    output += `   • ${colors.dim(formattedDiag)}\n`;
  }

  return output;
}

