/**
 * @module @kb-labs/cli-core/discovery/strategies/dir
 * Directory strategy - discover plugins from .kb/plugins/
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { isManifestV3 } from "@kb-labs/plugin-contracts";
import { getLogger } from "@kb-labs/core-sys/logging";
import type { DiscoveryStrategy, DiscoveryResult } from "../types";
import type { PluginBrief } from "../../registry/plugin-registry";
import { safeImport } from "../utils/safe-import.js";

const logger = getLogger("DirStrategy");

/**
 * Directory discovery strategy (.kb/plugins/)
 */
export class DirStrategy implements DiscoveryStrategy {
  name = "dir" as const;
  priority = 3;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    logger.debug("Starting discovery", { roots });
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      const pluginsDir = path.join(root, ".kb", "plugins");
      logger.debug("Checking plugins directory", { pluginsDir });
      if (!fs.existsSync(pluginsDir)) {
        logger.debug("Plugins directory not found", { pluginsDir });
        continue;
      }
      logger.debug("Found plugins directory", { pluginsDir });

      try {
        // Find all manifest files in .kb/plugins/
        const manifestFiles = await glob("**/manifest.{js,mjs,cjs,ts}", {
          cwd: pluginsDir,
          absolute: true,
        });
        logger.debug("Found manifest files", {
          count: manifestFiles.length,
          pluginsDir,
        });

        for (const manifestPath of manifestFiles) {
          try {
            logger.debug("Loading manifest", { manifestPath });
            // Load and parse manifest with timeout protection
            const manifestModule = await safeImport(manifestPath);
            logger.debug("Manifest imported successfully", { manifestPath });
            const manifestData: unknown =
              manifestModule.default ||
              manifestModule.manifest ||
              manifestModule;

            if (isManifestV3(manifestData)) {
              const manifest = manifestData;
              const pluginId =
                manifest.id || path.basename(path.dirname(manifestPath));
              logger.debug("Successfully loaded manifest", {
                pluginId,
                manifestPath,
              });

              // Try to find package.json for additional info
              const pkgPath = path.join(
                path.dirname(manifestPath),
                "package.json",
              );
              let display: any = {};

              if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
                display = {
                  name: manifest.display?.name || pkg.kbLabs?.name || pkg.name,
                  description:
                    manifest.display?.description ||
                    pkg.kbLabs?.description ||
                    pkg.description,
                };
              } else {
                display = {
                  name: manifest.display?.name,
                  description: manifest.display?.description,
                };
              }

              const pluginDir = path.dirname(manifestPath);

              plugins.push({
                id: pluginId,
                version: manifest.version || "0.0.0",
                kind: "v3",
                source: {
                  kind: "dir",
                  path: pluginDir,
                },
                display,
              });

              // Store manifest
              manifests.set(pluginId, manifest);
            } else {
              logger.debug("Manifest is not V2, skipping", {
                manifestPath,
                version,
              });
            }
          } catch (error) {
            logger.error("Error loading manifest", {
              manifestPath,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
            errors.push({
              path: manifestPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        logger.error("Error reading plugins directory", {
          pluginsDir,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        errors.push({
          path: pluginsDir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.debug("Discovery completed", {
      pluginsFound: plugins.length,
      manifestsFound: manifests.size,
      errorsCount: errors.length,
    });
    return { plugins, manifests, errors };
  }
}
