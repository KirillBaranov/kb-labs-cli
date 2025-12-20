/**
 * @module @kb-labs/cli-api/modules/health/git-info
 * Git information extraction.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

import type { GitInfo } from './types.js';

let cachedGitInfo: GitInfo | null | undefined;

/**
 * Find git root directory from given roots.
 */
export function findGitRoot(roots?: string[]): string | null {
  if (!roots || roots.length === 0) {
    return null;
  }

  for (const root of roots) {
    let current = resolve(root);
    let previous = '';
    while (current !== previous) {
      if (existsSync(join(current, '.git'))) {
        return current;
      }
      previous = current;
      current = dirname(current);
    }
  }

  return null;
}

/**
 * Get git information (SHA and dirty status).
 * Caches result for performance.
 */
export function getGitInfo(roots?: string[]): GitInfo | undefined {
  if (cachedGitInfo !== undefined) {
    return cachedGitInfo ?? undefined;
  }

  // Check environment variables first
  const envSha =
    process.env.KB_GIT_SHA ||
    process.env.KB_LABS_GIT_SHA ||
    process.env.CI_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (envSha) {
    cachedGitInfo = {
      sha: envSha,
      dirty: ['1', 'true', 'yes'].includes(
        String(process.env.KB_GIT_DIRTY || process.env.CI_DIRTY || '').toLowerCase()
      ),
    };
    return cachedGitInfo;
  }

  // Find git root
  const root = findGitRoot(roots) ?? findGitRoot([process.cwd()]);
  if (!root) {
    cachedGitInfo = null;
    return undefined;
  }

  try {
    const headPath = join(root, '.git', 'HEAD');
    if (!existsSync(headPath)) {
      cachedGitInfo = null;
      return undefined;
    }

    const headContent = readFileSync(headPath, 'utf8').trim();
    let sha = headContent;

    if (headContent.startsWith('ref:')) {
      const ref = headContent.replace('ref:', '').trim();
      const refPath = join(root, '.git', ref);
      if (existsSync(refPath)) {
        sha = readFileSync(refPath, 'utf8').trim();
      }
    }

    let dirty = false;
    try {
      const output = execSync('git status --porcelain', {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      dirty = output.length > 0;
    } catch {
      dirty = false;
    }

    cachedGitInfo = { sha, dirty };
    return cachedGitInfo;
  } catch {
    cachedGitInfo = null;
    return undefined;
  }
}

/**
 * Reset cached git info (for testing).
 */
export function resetGitInfoCache(): void {
  cachedGitInfo = undefined;
}
