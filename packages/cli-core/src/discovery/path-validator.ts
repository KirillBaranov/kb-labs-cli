/**
 * @module @kb-labs/cli-core/discovery/path-validator
 * Path validation for security (prevent traversal attacks)
 */

import * as path from "node:path";
import { promises as fs } from "node:fs";
import { getLogger } from "@kb-labs/core-sys/logging";

const logger = getLogger("PathValidator");

/**
 * PathValidator - validates and normalizes file paths for security
 */
export class PathValidator {
  /**
   * Validate that path is within allowed roots and not using .. traversal
   * @param targetPath - Path to validate
   * @param allowedRoots - Array of allowed root directories
   * @returns true if path is valid and safe
   */
  static validate(targetPath: string, allowedRoots: string[]): boolean {
    try {
      const normalized = path.normalize(targetPath);
      const resolved = path.resolve(normalized);

      // Check for .. traversal in normalized path
      if (normalized.includes("..")) {
        logger.warn("Path traversal detected", { targetPath });
        return false;
      }

      // Check if within allowed roots
      const isWithinRoot = allowedRoots.some((root) => {
        const normalizedRoot = path.resolve(root);
        return resolved.startsWith(normalizedRoot);
      });

      if (!isWithinRoot) {
        logger.warn("Path outside allowed roots", { targetPath, allowedRoots });
        return false;
      }

      return true;
    } catch (error) {
      logger.warn("Validation error", {
        targetPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Resolve symlinks to real path
   * @param targetPath - Path to resolve
   * @returns Real path or original if resolution fails
   */
  static async realpath(targetPath: string): Promise<string> {
    try {
      return await fs.realpath(targetPath);
    } catch (_error) {
      // If realpath fails (e.g., file doesn't exist), return original
      return targetPath;
    }
  }

  /**
   * Normalize path for cross-platform compatibility
   * Converts backslashes to forward slashes for consistency
   * @param targetPath - Path to normalize
   * @returns Normalized path
   */
  static normalize(targetPath: string): string {
    return path.normalize(targetPath).replace(/\\/g, "/");
  }

  /**
   * Check if path exists and is accessible
   * @param targetPath - Path to check
   * @returns true if path exists and is accessible
   */
  static async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats safely
   * @param targetPath - Path to stat
   * @returns File stats or null if error
   */
  static async stat(
    targetPath: string,
  ): Promise<{ isFile: boolean; isDirectory: boolean; mtime: Date } | null> {
    try {
      const stats = await fs.stat(targetPath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        mtime: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Validate and normalize path in one call
   * @param targetPath - Path to validate and normalize
   * @param allowedRoots - Array of allowed root directories
   * @returns Normalized path or null if invalid
   */
  static validateAndNormalize(
    targetPath: string,
    allowedRoots: string[],
  ): string | null {
    if (!this.validate(targetPath, allowedRoots)) {
      return null;
    }
    return this.normalize(targetPath);
  }

  /**
   * Batch validate multiple paths
   * @param paths - Array of paths to validate
   * @param allowedRoots - Array of allowed root directories
   * @returns Array of valid paths (invalid ones are filtered out)
   */
  static batchValidate(paths: string[], allowedRoots: string[]): string[] {
    return paths.filter((p) => this.validate(p, allowedRoots));
  }

  /**
   * Check if path is a hidden file/directory (starts with .)
   * @param targetPath - Path to check
   * @returns true if hidden
   */
  static isHidden(targetPath: string): boolean {
    const basename = path.basename(targetPath);
    return basename.startsWith(".");
  }

  /**
   * Check if path matches ignore patterns
   * Common patterns: node_modules, dist, build, .git, etc.
   * @param targetPath - Path to check
   * @param customPatterns - Optional custom ignore patterns
   * @returns true if should be ignored
   */
  static shouldIgnore(
    targetPath: string,
    customPatterns: RegExp[] = [],
  ): boolean {
    const defaultPatterns = [
      /node_modules/,
      /dist/,
      /build/,
      /coverage/,
      /\.git\//,
      /\.vscode/,
      /\.idea/,
      /\.DS_Store/,
    ];

    const allPatterns = [...defaultPatterns, ...customPatterns];
    return allPatterns.some((pattern) => pattern.test(targetPath));
  }
}
