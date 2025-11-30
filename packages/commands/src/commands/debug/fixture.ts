/**
 * fixture command - Create and manage test fixtures
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { registry } from '../../registry/service';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import type { CliCommandDecl } from '@kb-labs/plugin-manifest';

type FixtureResult = CommandResult & {
  mode?: 'create' | 'list';
  commandName?: string;
  pluginName?: string;
  fixtureDir?: string;
  fixtures?: Array<{
    name: string;
    path: string;
  }>;
};

type FixtureFlags = {
  json: { type: 'boolean'; description?: string };
};

export const fixture = defineSystemCommand<FixtureFlags, FixtureResult>({
  name: 'fixture',
  description: 'Create and manage test fixtures for plugins',
  category: 'debug',
  examples: ['kb fixture create mind:init', 'kb fixture list'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'fixture',
    startEvent: 'FIXTURE_STARTED',
    finishEvent: 'FIXTURE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const subcommand = argv[0];

    if (!subcommand) {
      throw new Error('Please provide a subcommand: create, list');
    }

    if (subcommand === 'create') {
      const commandName = argv[1];
      if (!commandName) {
        throw new Error('Please provide command name (e.g., mind:init)');
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
        throw new Error(`Plugin ${pluginName} not found`);
      }

      const manifestV2 = registered.manifest.manifestV2;
      if (!manifestV2) {
        throw new Error(`Plugin ${pluginName} has no ManifestV2`);
      }

      const cliCommands = manifestV2.cli?.commands ?? [];
      const cliCommand: CliCommandDecl | undefined = commandId
        ? cliCommands.find((c) => c.id === commandId)
        : cliCommands[0];

      if (!cliCommand) {
        throw new Error(`Command ${commandName} not found in plugin manifest`);
      }

      const cwd = getContextCwd(ctx);
      const pluginRoot = registered.pkgRoot ?? cwd;
      const fixtureCommandId = commandId || 'default';
      const fixturesDir = path.join(pluginRoot, '__fixtures__', fixtureCommandId);

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

      ctx.logger?.info('Fixtures created', { commandName, fixturesDir });

      return {
        ok: true,
        mode: 'create',
        command: commandName,
        pluginId: manifestV2.id,
        fixturesDir,
        created: [fixtureFile, readmeFile],
      };
    }

    if (subcommand === 'list') {
      const manifests = registry.listManifests?.() ?? [];
      const fixtures: Array<{ plugin: string; command: string; path: string }> = [];
      const cwd = getContextCwd(ctx);

      for (const registered of manifests) {
        const pluginRoot = registered.pkgRoot ?? cwd;
        const pluginFixturesDir = path.join(pluginRoot, '__fixtures__');

        try {
          const dirs = await fs.readdir(pluginFixturesDir);
          for (const dir of dirs) {
            const fixturePath = path.join(pluginFixturesDir, dir);
            const stat = await fs.stat(fixturePath);
            if (stat.isDirectory()) {
              const pluginId =
                registered.manifest.manifestV2?.id ?? registered.manifest.package ?? 'unknown';
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

      ctx.logger?.info('Fixtures listed', { count: fixtures.length });

      return {
        ok: true,
        mode: 'list',
        fixtures,
      };
    }

    throw new Error(`Unknown subcommand: ${subcommand}. Available: create, list`);
  },
  formatter(result, ctx, flags) {
    const resultData = result as any;

    if (flags.json) {
      ctx.output?.json(resultData);
      return;
    }

    if (!ctx.output) {
      throw new Error('Output not available');
    }

    if (resultData.mode === 'create') {
      ctx.output?.info(`✓ Created test fixtures for ${resultData.command}`);
      ctx.output?.info(`  Directory: ${resultData.fixturesDir}`);
      ctx.output?.info('  Files: example.json, README.md');
      ctx.output?.info('');
      ctx.output?.info('Usage:');
      ctx.output?.info(`  kb ${resultData.command} --mock`);
      ctx.output?.info(`  kb ${resultData.command} --record-mocks`);
    } else if (resultData.mode === 'list') {
      const fixtures = resultData.fixtures;
      if (fixtures.length === 0) {
        ctx.output?.info('No fixtures found');
        ctx.output?.info('Use `kb fixture create <plugin>:<command>` to create fixtures');
      } else {
        ctx.output?.info(`Found ${fixtures.length} fixture(s):\n`);
        for (const item of fixtures) {
          ctx.output?.info(`  ${item.plugin}:${item.command}`);
          ctx.output?.info(`    Path: ${item.path}`);
        }
      }
    }
  },
});






