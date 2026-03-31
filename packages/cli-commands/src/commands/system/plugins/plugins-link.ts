/**
 * marketplace:link command - Link a local plugin for development
 *
 * Registers the plugin in .kb/marketplace.lock with source: 'local'.
 * No file watching — run `kb registry refresh` after manifest changes.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  addToMarketplaceLock,
  createMarketplaceEntry,
  extractEntityKinds,
  loadManifest,
  DiagnosticCollector,
} from '@kb-labs/core-discovery';
import { computePackageIntegrity } from '@kb-labs/core-registry';

type PluginsLinkResult = CommandResult & {
  packageName?: string;
  absPath?: string;
  hasManifest?: boolean;
  provides?: string[];
  message?: string;
};

type PluginsLinkFlags = Record<string, never>;

export const pluginsLink = defineSystemCommand<PluginsLinkFlags, PluginsLinkResult>({
  name: 'link',
  description: 'Link a local plugin for development',
  category: 'marketplace',
  examples: generateExamples('link', 'marketplace', [
    { flags: {} },
  ]),
  flags: {},
  analytics: {
    command: 'marketplace:link',
    startEvent: 'MARKETPLACE_LINK_STARTED',
    finishEvent: 'MARKETPLACE_LINK_FINISHED',
  },
  async handler(ctx, argv, _flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin path to link');
    }

    const pluginPath = argv[0]!;
    const cwd = getContextCwd(ctx);
    const absPath = path.resolve(cwd, pluginPath);

    // Validate package exists
    const pkgJsonPath = path.join(absPath, 'package.json');
    await fs.access(pkgJsonPath);
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
    const packageName: string = pkgJson.name ?? path.basename(absPath);

    // Load manifest
    const diag = new DiagnosticCollector();
    const manifest = await loadManifest(absPath, diag);
    const hasManifest = manifest !== null;

    if (!hasManifest) {
      ctx.platform?.logger?.warn('No ManifestV3 found — plugin may not be discoverable', {
        packageName, pluginPath,
        diagnostics: diag.getEvents(),
      });
    }

    // Compute integrity & entity kinds
    const integrity = await computePackageIntegrity(absPath);
    const provides = manifest ? extractEntityKinds(manifest) : [];

    // Write to marketplace.lock with source: 'local'
    const entry = createMarketplaceEntry({
      version: pkgJson.version ?? '0.0.0',
      integrity,
      resolvedPath: path.relative(cwd, absPath),
      source: 'local',
      provides,
    });
    await addToMarketplaceLock(cwd, packageName, entry);

    return {
      ok: true,
      packageName,
      absPath,
      hasManifest,
      provides,
      message: `Linked ${packageName} from ${absPath}`,
    };
  },
  formatter(result, ctx, _flags) {
    if (!result.hasManifest) {
      ctx.ui.warn(`No ManifestV3 found in ${result.packageName ?? 'unknown'}`);
      ctx.ui.info('Add kb.plugin.json or set kbLabs.manifest in package.json');
    }
    ctx.ui.success(result.message ?? 'Plugin linked');
    if (result.provides?.length) {
      ctx.ui.info(`Provides: ${result.provides.join(', ')}`);
    }
    ctx.ui.info('Entry written to .kb/marketplace.lock');
  },
});
