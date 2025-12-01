/**
 * @module @kb-labs/cli-commands/plugins-introspect
 * Plugin introspection command
 */

import type { CliCommand } from '@kb-labs/cli-core';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { generateOpenAPI } from '@kb-labs/plugin-adapter-rest';
import { toRegistry } from '@kb-labs/plugin-adapter-studio';
import { CliError, CLI_ERROR_CODES, PluginRegistry } from '@kb-labs/cli-core';

/**
 * Create introspection command
 */
export function createPluginsIntrospectCommand(): CliCommand {
  return {
    name: 'plugins:introspect',
    description: 'Introspect plugin manifest and generate artifacts',
    registerFlags: (builder) => {
      builder({
        id: {
          type: 'string',
          alias: 'i',
          description: 'Plugin ID',
          required: true,
        },
        format: {
          type: 'string',
          alias: 'f',
          description: 'Output format: manifest|openapi|registry|all',
          choices: ['manifest', 'openapi', 'registry', 'all'],
          default: 'all',
        },
        output: {
          type: 'string',
          alias: 'o',
          description: 'Output file (for single format)',
        },
      });
    },
    run: async (ctx, argv, flags) => {
      const pluginId = flags.id as string;
      const format = (flags.format || 'all') as string;
      const output = flags.output as string | undefined;

      try {
        const registry = new PluginRegistry({
          strategies: ['workspace', 'pkg', 'dir', 'file'],
          roots: ctx.repoRoot ? [ctx.repoRoot] : undefined,
        });
        try {
          await registry.refresh();

          const manifest = registry.getManifestV2(pluginId);
          if (!manifest) {
            throw new CliError(
              CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
              `Plugin ${pluginId} not found`
            );
          }

          // Generate artifacts based on format
          if (format === 'manifest' || format === 'all') {
            if (output && format === 'manifest') {
              await ctx.presenter.write(JSON.stringify(manifest, null, 2));
            } else {
              ctx.presenter.info('=== Manifest v2 ===');
              ctx.presenter.write(JSON.stringify(manifest, null, 2));
            }
          }

          if (format === 'openapi' || format === 'all') {
            const openapi = generateOpenAPI(manifest);
            if (output && format === 'openapi') {
              await ctx.presenter.write(JSON.stringify(openapi, null, 2));
            } else {
              ctx.presenter.info('=== OpenAPI Spec ===');
              ctx.presenter.write(JSON.stringify(openapi, null, 2));
            }
          }

          if (format === 'registry' || format === 'all') {
            const registryArtifact = toRegistry(manifest);
            if (output && format === 'registry') {
              await ctx.presenter.write(JSON.stringify(registryArtifact, null, 2));
            } else {
              ctx.presenter.info('=== Studio Registry ===');
              ctx.presenter.write(JSON.stringify(registryArtifact, null, 2));
            }
          }

          return 0;
        } finally {
          await registry.dispose();
        }
      } catch (e) {
        if (e instanceof CliError) {
          throw e;
        }
        throw new CliError(
          CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
          `Failed to introspect plugin: ${e instanceof Error ? e.message : String(e)}`,
          e
        );
      }
    },
  };
}
