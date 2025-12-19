/**
 * @module @kb-labs/cli-commands/plugins-introspect
 * Plugin introspection command
 */

import type { CliCommand } from '@kb-labs/cli-core';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import { generateOpenAPISpec } from '@kb-labs/cli-core';
import { CliError, CLI_ERROR_CODES, PluginRegistry } from '@kb-labs/cli-core';

/**
 * Convert manifest to Studio registry format
 */
function toRegistry(manifest: ManifestV3) {
  const pluginMeta = {
    id: manifest.id,
    version: manifest.version,
    displayName: manifest.display?.name,
  };

  const widgets = manifest.studio?.widgets?.map((widget, idx) => ({
    id: widget.id,
    kind: widget.kind,
    title: widget.title,
    description: widget.description,
    data: widget.data,
    options: widget.options,
    pollingMs: widget.pollingMs,
    order: widget.order ?? idx,
    layoutHint: widget.layoutHint,
    actions: widget.actions,
    events: widget.events,
    plugin: pluginMeta,
  })) || [];

  const menus = manifest.studio?.menus?.map((menu, idx) => ({
    id: menu.id,
    label: menu.label,
    target: menu.target,
    order: menu.order ?? idx,
    plugin: pluginMeta,
  })) || [];

  const layouts = manifest.studio?.layouts?.map((layout) => ({
    id: layout.id,
    name: layout.name,
    template: layout.template,
    kind: layout.kind,
    title: layout.title,
    description: layout.description,
    config: layout.config,
    widgets: layout.widgets,
    actions: layout.actions,
    plugin: pluginMeta,
  })) || [];

  return {
    schema: 'kb.studio-registry/1' as const,
    plugins: [{
      id: manifest.id,
      version: manifest.version,
      displayName: manifest.display?.name,
      widgets,
      menus,
      layouts,
    }],
    widgets,
    menus,
    layouts,
  };
}

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

          const manifest = registry.getManifestV3(pluginId);
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
            const openapi = generateOpenAPISpec(manifest);
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
