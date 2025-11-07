/**
 * fixture command - Create and manage test fixtures
 */

import type { Command } from '../../types/types';
import type { CliContext } from '@kb-labs/cli-core';
import { registry } from '../../utils/registry';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getContextCwd } from '../../utils/context';
import type { CliCommandDecl } from '@kb-labs/plugin-manifest';

export const fixture: Command = {
  name: 'fixture',
  category: 'debug',
  describe: 'Create and manage test fixtures for plugins',
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
    },
  ],
  examples: [
    'kb fixture create mind:init',
    'kb fixture list',
  ],

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>) {
    const jsonMode = Boolean(flags.json);
    const subcommand = argv[0];

    if (!subcommand) {
      ctx.presenter.error('Please provide a subcommand: create, list');
      ctx.presenter.info('Usage: kb fixture <create|list> [args...]');
      return 1;
    }

    if (subcommand === 'create') {
      const commandName = argv[1];
      if (!commandName) {
        ctx.presenter.error('Please provide command name (e.g., mind:init)');
        ctx.presenter.info('Usage: kb fixture create <plugin>:<command>');
        return 1;
      }

      const [pluginName, commandIdRaw] = commandName.includes(':')
        ? commandName.split(':', 2)
        : [commandName, ''];
      const commandId = commandIdRaw ?? '';

      const manifests = registry.listManifests?.() ?? [];
      const registered = manifests.find((m) => {
        const manifestId = m.manifest.manifestV2?.id ?? m.manifest.package;
        return manifestId === pluginName || m.manifest.package === pluginName;
      });

      if (!registered) {
        ctx.presenter.error(`Plugin ${pluginName} not found`);
        ctx.presenter.info('Use `kb plugins` to see available plugins');
        return 1;
      }

      const manifestV2 = registered.manifest.manifestV2;
      if (!manifestV2) {
        ctx.presenter.error(`Plugin ${pluginName} has no ManifestV2`);
        return 1;
      }

      const cliCommands = manifestV2.cli?.commands ?? [];
      const cliCommand: CliCommandDecl | undefined = commandId
        ? cliCommands.find((c) => c.id === commandId)
        : cliCommands[0];

      if (!cliCommand) {
        ctx.presenter.error(`Command ${commandName} not found in plugin manifest`);
        return 1;
      }

      const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });
      const pluginRoot = registered.pkgRoot ?? cwd;
      const fixtureCommandId = commandId || 'default';
      const fixturesDir = path.join(pluginRoot, '__fixtures__', fixtureCommandId);

      try {
        await fs.mkdir(fixturesDir, { recursive: true });

        const flagDefaults = (cliCommand.flags ?? []).reduce<Record<string, unknown>>((acc, flag) => {
          acc[flag.name] = flag.type === 'boolean' ? false : flag.type === 'number' ? 0 : '';
          return acc;
        }, {});

        const exampleFixture = {
          input: flagDefaults,
          context: {
            cwd,
            workdir: pluginRoot,
          },
          expected: {
            exitCode: 0,
            output: {},
          },
        };

        const fixtureFile = path.join(fixturesDir, 'example.json');
        await fs.writeFile(fixtureFile, JSON.stringify(exampleFixture, null, 2));

        const readme = `# Test Fixtures for ${commandName}

This directory contains test fixtures for the \`${commandName}\` command.

## Usage

Run command with mock fixtures:

\`\`\`bash
kb ${commandName} --mock
\`\`\`

Record real operations to fixtures:

\`\`\`bash
kb ${commandName} --record-mocks
\`\`\`

## Files

- \`example.json\` - Example fixture with input and expected output
- Add more fixtures as needed

## Structure

\`\`\`json
${JSON.stringify(exampleFixture, null, 2)}
\`\`\`
`;

        const readmeFile = path.join(fixturesDir, 'README.md');
        await fs.writeFile(readmeFile, readme);

        if (jsonMode) {
          ctx.presenter.json({
            ok: true,
            command: commandName,
            pluginId: manifestV2.id,
            fixturesDir,
            created: [fixtureFile, readmeFile],
          });
        } else {
          ctx.presenter.info(`✓ Created test fixtures for ${commandName}`);
          ctx.presenter.info(`  Directory: ${fixturesDir}`);
          ctx.presenter.info('  Files: example.json, README.md');
          ctx.presenter.info('');
          ctx.presenter.info('Usage:');
          ctx.presenter.info(`  kb ${commandName} --mock`);
          ctx.presenter.info(`  kb ${commandName} --record-mocks`);
        }

        return 0;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.presenter.error(`Failed to create fixtures: ${message}`);
        return 1;
      }
    }

    if (subcommand === 'list') {
      const manifests = registry.listManifests?.() ?? [];
      const fixtures: Array<{ plugin: string; command: string; path: string }> = [];

      for (const registered of manifests) {
        const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });
        const pluginRoot = registered.pkgRoot ?? cwd;
        const pluginFixturesDir = path.join(pluginRoot, '__fixtures__');

        try {
          const dirs = await fs.readdir(pluginFixturesDir);
          for (const dir of dirs) {
            const fixturePath = path.join(pluginFixturesDir, dir);
            const stat = await fs.stat(fixturePath);
            if (stat.isDirectory()) {
              const pluginId = registered.manifest.manifestV2?.id ?? registered.manifest.package ?? 'unknown';
              fixtures.push({
                plugin: pluginId,
                command: dir,
                path: fixturePath,
              });
            }
          }
        } catch {
          // No fixtures directory
        }
      }

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          fixtures,
        });
      } else {
        if (fixtures.length === 0) {
          ctx.presenter.info('No fixtures found');
          ctx.presenter.info('Use `kb fixture create <plugin>:<command>` to create fixtures');
        } else {
          ctx.presenter.info(`Found ${fixtures.length} fixture(s):\n`);
          for (const item of fixtures) {
            ctx.presenter.info(`  ${item.plugin}:${item.command}`);
            ctx.presenter.info(`    Path: ${item.path}`);
          }
        }
      }

      return 0;
    }

    ctx.presenter.error(`Unknown subcommand: ${subcommand}`);
    ctx.presenter.info('Available subcommands: create, list');
    return 1;
  },
};






