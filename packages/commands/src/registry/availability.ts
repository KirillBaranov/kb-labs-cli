/**
 * @kb-labs/cli-commands/registry
 * Dependency availability checking with ESM support
 * 
 * IMPORTANT: Only resolve, never import() - imports happen in loader()
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { CommandManifest, AvailabilityCheck } from './types.js';

// Create require from this module (ESM-safe, doesn't depend on cwd)
const req = createRequire(import.meta.url);

// Get the directory containing this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve a package from a specific directory
 * Uses paths option to search from cwd, not from CLI package
 * IMPORTANT: Only resolve, never import() - imports happen in loader()
 */
function resolveFromCwd(spec: string, cwd: string): string {
  // Try resolving from multiple locations
  const cliRoot = path.resolve(__dirname, '../../..');
  const pathsToTry = [cwd, cliRoot];
  
  for (const searchPath of pathsToTry) {
    try {
      const result = req.resolve(spec, { paths: [searchPath] });
      return result;
    } catch (_e: any) {
      // Try next path
    }
  }
  
  // If all paths failed, throw the last error
  throw new Error(`Cannot resolve ${spec} from any of: ${pathsToTry.join(', ')}`);
}

/**
 * Check if all required dependencies for a command are available
 * @param manifest Command manifest with requires field
 * @param cwd Working directory to resolve from (defaults to process.cwd())
 * @returns Availability status with reason and hint if unavailable
 */
export function checkRequires(manifest: CommandManifest, cwd = process.cwd()): AvailabilityCheck {
  if (!manifest.requires || manifest.requires.length === 0) {
    return { available: true as const };
  }
  
  for (const dep of manifest.requires) {
    try {
      // Try to resolve the package
      const resolved = resolveFromCwd(dep, cwd);
      // Additional check: verify that the resolved path contains package.json
      // This handles cases where require.resolve throws due to exports but package exists
      if (!resolved.includes('node_modules')) {
        continue;
      }
    } catch (err: any) {
      // If the error is about exports or if we can't resolve, try to check if package exists by looking for package.json
      // Check the nested error as well (the actual require.resolve error might be wrapped)
      const errorMessage = err.message || '';
      const hasExportsError = errorMessage.includes('exports') || errorMessage.includes('main');
      
      if (hasExportsError || errorMessage.includes('Cannot resolve')) {
        // Package might exist - try to verify by checking for package.json
        // Parse scoped package name (e.g., @kb-labs/devlink-core -> kb-labs/devlink-core)
        const parts = dep.startsWith('@') 
          ? dep.slice(1).split('/')
          : [dep];
        
        if (parts.length === 0) {continue;}
        
        const scope = parts.length >= 2 ? parts[0] : '';
        const packageName = parts.length >= 2 ? parts[1] : parts[0];
        
        if (!packageName) {continue;}
        
        // Try to find the package.json
        const cliRoot = path.resolve(__dirname, '../../..');
        const packagePath = scope 
          ? path.join(cliRoot, 'node_modules', '@' + scope, packageName, 'package.json')
          : path.join(cliRoot, 'node_modules', packageName, 'package.json');
        
        if (existsSync(packagePath)) {
          // Package exists - consider it available
          continue;
        }
      }
      
      return {
        available: false as const,
        reason: `Missing dependency: ${dep}`,
        hint: 'Run: kb devlink apply',
      };
    }
  }
  
  return { available: true as const };
}

