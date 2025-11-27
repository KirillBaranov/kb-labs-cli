/**
 * plugin:generate command - Generate contracts or schemas from manifest
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import {
  extractContractsFromManifest,
  generateZodSchemasFromContracts,
  generateContractFile,
} from '@kb-labs/plugin-manifest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginGenerateFlags = {
  manifest: { type: 'string'; description?: string; default?: string };
  type: { type: 'string'; description?: string; choices?: string[] };
  output: { type: 'string'; description?: string };
};

type PluginGenerateResult = CommandResult & {
  generated?: boolean;
  outputPath?: string;
};

export const pluginGenerate = defineSystemCommand<PluginGenerateFlags, PluginGenerateResult>({
  name: 'plugin:generate',
  description: 'Generate contracts or Zod schemas from manifest',
  category: 'plugins',
  flags: {
    manifest: {
      type: 'string',
      description: 'Path to manifest file (default: manifest.v2.ts)',
      default: 'manifest.v2.ts',
    },
    type: {
      type: 'string',
      description: 'What to generate: contracts or schemas',
      choices: ['contracts', 'schemas'],
    },
    output: {
      type: 'string',
      description: 'Output file path (default: contracts/src/contract.ts or contracts/src/schema.ts)',
    },
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd();
    const manifestPath = path.resolve(cwd, flags.manifest || 'manifest.v2.ts');

    if (!flags.type) {
      const errorText = ctx.output!.ui.sideBox({
        title: 'Plugin Generate',
        sections: [
          {
            header: 'Error',
            items: ['--type is required. Use "contracts" or "schemas"'],
          },
        ],
        status: 'error',
        timing: ctx.tracker.total(),
      });
      ctx.output?.write(errorText);
      return { ok: false };
    }

    ctx.tracker.checkpoint('parse');

    // Read and parse manifest
    let manifest: unknown;
    try {
      // Try to import manifest (for TypeScript files)
      const modulePath = manifestPath.replace(/\.ts$/, '');
      const manifestModule = await import(modulePath);
      manifest = manifestModule.manifest || manifestModule.default;
    } catch (error) {
      // Fallback to JSON parsing
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent);
      } catch (jsonError) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorText = ctx.output!.ui.sideBox({
          title: 'Plugin Generate',
          sections: [
            {
              header: 'Error',
              items: [`Failed to parse manifest: ${errorMessage}`],
            },
            {
              header: 'Manifest Path',
              items: [manifestPath],
            },
          ],
          status: 'error',
          timing: ctx.tracker.total(),
        });
        ctx.output?.write(errorText);
        return { ok: false };
      }
    }

    ctx.tracker.checkpoint('generate');

    let outputPath: string;
    let generatedCode: string;

    if (flags.type === 'contracts') {
      // Generate contracts
      outputPath = flags.output || path.resolve(cwd, 'contracts/src/contract.ts');
      generatedCode = generateContractFile(manifest as any);
    } else if (flags.type === 'schemas') {
      // Generate Zod schemas
      outputPath = flags.output || path.resolve(cwd, 'contracts/src/schema.ts');
      const contracts = extractContractsFromManifest(manifest as any);
      generatedCode = generateZodSchemasFromContracts(contracts);
    } else {
      const errorText = ctx.output!.ui.sideBox({
        title: 'Plugin Generate',
        sections: [
          {
            header: 'Error',
            items: [`Unknown type: ${flags.type}`],
          },
        ],
        status: 'error',
        timing: ctx.tracker.total(),
      });
      ctx.output?.write(errorText);
      return { ok: false };
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write generated code
    await fs.writeFile(outputPath, generatedCode, 'utf-8');

    ctx.tracker.checkpoint('complete');

    const sections: Array<{ header?: string; items: string[] }> = [
      {
        header: 'Summary',
        items: [
          `Type: ${flags.type}`,
          `Manifest: ${manifestPath}`,
          `Output: ${outputPath}`,
        ],
      },
    ];

    const outputText = ctx.output!.ui.sideBox({
      title: 'Plugin Generate',
      sections,
      status: 'success',
      timing: ctx.tracker.total(),
    });
    ctx.output?.write(outputText);

    return { ok: true, generated: true, outputPath };
  },
});

