/**
 * replay command - Replay snapshot for debugging
 */

import type { Command } from '../../types/types';
import { loadSnapshot, listSnapshots, diffSnapshots, searchSnapshots } from '@kb-labs/plugin-runtime';
import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import type { CliContext } from '@kb-labs/cli-core';
import { registry } from '../../utils/registry';
import { box, keyValue, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';
import { getContextCwd } from '../../utils/context';
import type { CliCommandDecl } from '@kb-labs/plugin-manifest';

export const replay: Command = {
  name: 'replay',
  category: 'debug',
  describe: 'Replay command execution from snapshot',
  flags: [
    {
      name: 'list',
      type: 'boolean',
      description: 'List all available snapshots',
    },
    {
      name: 'last',
      type: 'boolean',
      description: 'Replay the last snapshot',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
    },
    {
      name: 'diff',
      type: 'string',
      description: 'Compare this snapshot with another',
    },
    {
      name: 'plugin',
      type: 'string',
      description: 'Filter snapshots by plugin ID',
    },
    {
      name: 'command',
      type: 'string',
      description: 'Filter snapshots by command',
    },
    {
      name: 'error',
      type: 'boolean',
      description: 'Show only snapshots with errors',
    },
  ],
  examples: [
    'kb replay <snapshot-id>',
    'kb replay --list',
    'kb replay --last',
    'kb replay <id1> --diff <id2>',
    'kb replay --list --plugin @kb-labs/mind --error',
  ],

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>) {
    const jsonMode = Boolean(flags.json);
    const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });

    // List snapshots with filters
    if (flags.list) {
      let snapshots = await listSnapshots(cwd);
      
      // Apply filters
      if (flags.plugin || flags.command || typeof flags.error === 'boolean') {
        const filtered = await searchSnapshots(
          {
            pluginId: typeof flags.plugin === 'string' ? flags.plugin : undefined,
            command: typeof flags.command === 'string' ? flags.command : undefined,
            error: typeof flags.error === 'boolean' ? flags.error : undefined,
          },
          cwd
        );
        snapshots = filtered;
      }
      
      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          snapshots: snapshots.map(s => ({
            id: s.id,
            timestamp: s.timestamp,
            command: s.command,
            pluginId: s.pluginId,
            result: s.result,
            error: s.error?.code,
          })),
        });
        return 0;
      }

      if (snapshots.length === 0) {
        ctx.presenter.info('No snapshots found');
        return 0;
      }

      ctx.presenter.info(`Found ${snapshots.length} snapshot(s):\n`);
      for (const snapshot of snapshots) {
        const status = snapshot.result === 'error' ? '✗' : '✓';
        const errorInfo = snapshot.error ? ` (${snapshot.error.code})` : '';
        ctx.presenter.info(
          `${status} ${snapshot.id} - ${snapshot.command}${errorInfo}`
        );
        ctx.presenter.info(`   ${snapshot.timestamp}`);
        if (snapshot.error) {
          ctx.presenter.info(`   Error: ${snapshot.error.message}`);
        }
      }
      return 0;
    }

    // Diff snapshots if requested
    if (flags.diff && typeof flags.diff === 'string') {
      const snapshotId = argv[0];
      if (!snapshotId) {
        ctx.presenter.error('Please provide first snapshot ID');
        return 1;
      }
      
      try {
        const diff = await diffSnapshots(snapshotId, flags.diff, cwd);
        
        if (jsonMode) {
          ctx.presenter.json({
            ok: true,
            ...diff,
          });
          return 0;
        }
        
        const diffLines = (diff.differences ?? []).flatMap((difference) => [
          `  ${safeColors.dim('Field:')} ${difference.field}`,
          `    ${safeColors.error('-')} ${JSON.stringify(difference.value1, null, 2)}`,
          `    ${safeColors.success('+')} ${JSON.stringify(difference.value2, null, 2)}`,
        ]);
        
        const summary = keyValue({
          'Snapshot 1': diff.id1,
          'Snapshot 2': diff.id2,
          'Differences': diff.differences.length.toString(),
        });
        
        const output = box('Snapshot Comparison', [
          ...summary,
          '',
          ...diffLines,
        ]);
        
        ctx.presenter.write(output);
        return 0;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.presenter.error(`Diff failed: ${message}`);
        return 1;
      }
    }
    
    // Replay snapshot
    let snapshotId: string | undefined;
    
    if (flags.last) {
      const snapshots = await listSnapshots(cwd);
      const [latestSnapshot] = snapshots;
      if (!latestSnapshot) {
        ctx.presenter.error('No snapshots found');
        return 1;
      }
      snapshotId = latestSnapshot.id;
    } else if (argv.length > 0) {
      snapshotId = argv[0];
    } else {
      ctx.presenter.error('Please provide snapshot ID or use --last flag');
      ctx.presenter.info('Use `kb replay --list` to see available snapshots');
      return 1;
    }

    if (!snapshotId) {
      ctx.presenter.error('Snapshot ID is required');
      return 1;
    }

    // Load snapshot
    const snapshot = await loadSnapshot(snapshotId, cwd);
    if (!snapshot) {
      ctx.presenter.error(`Snapshot not found: ${snapshotId}`);
      ctx.presenter.info('Use `kb replay --list` to see available snapshots');
      return 1;
    }

    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        snapshot: {
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          command: snapshot.command,
          pluginId: snapshot.pluginId,
          input: snapshot.input,
          context: snapshot.context,
          result: snapshot.result,
        },
      });
      return 0;
    }

    ctx.presenter.info(`Replaying snapshot: ${snapshot.id}`);
    ctx.presenter.info(`Command: ${snapshot.command}`);
    ctx.presenter.info(`Timestamp: ${snapshot.timestamp}`);
    ctx.presenter.info(`Plugin: ${snapshot.pluginId}@${snapshot.pluginVersion}`);
    ctx.presenter.info('');

    // Find the plugin in registry
    const manifests = registry.listManifests?.() ?? [];
    const registered = manifests.find((m) =>
      m.manifest.manifestV2?.id === snapshot.pluginId ||
      m.manifest.package === snapshot.pluginId
    );

    if (!registered) {
      ctx.presenter.error(`Plugin ${snapshot.pluginId} not found in registry`);
      ctx.presenter.info('Make sure the plugin is installed and registered');
      return 1;
    }

    if (!registered.available) {
      ctx.presenter.error(`Plugin ${snapshot.pluginId} is not available: ${registered.unavailableReason}`);
      return 1;
    }

    const manifestV2 = registered.manifest.manifestV2;
    if (!manifestV2) {
      ctx.presenter.error(`Plugin ${snapshot.pluginId} has no ManifestV2`);
      return 1;
    }

    // Find CLI command in manifest
    const commandId = snapshot.command.includes(':')
      ? snapshot.command.split(':', 2).pop() ?? snapshot.command
      : snapshot.command;

    const cliCommands = manifestV2.cli?.commands ?? [];
    const cliCommand: CliCommandDecl | undefined =
      cliCommands.find((c) => c.id === commandId || c.id === snapshot.command);

    if (!cliCommand || !cliCommand.handler) {
      ctx.presenter.error(`Command ${snapshot.command} not found in plugin manifest`);
      return 1;
    }

    // Restore workdir from snapshot
    const workdir = snapshot.context?.workdir ?? snapshot.context?.cwd ?? cwd;

    ctx.presenter.info(`Replaying with:`);
    ctx.presenter.info(`  Input: ${JSON.stringify(snapshot.input)}`);
    ctx.presenter.info(`  Workdir: ${workdir}`);
    ctx.presenter.info('');

    // Execute command with same input/flags
    try {
      const exitCode = await executeCommand(
        cliCommand,
        manifestV2,
        ctx,
        snapshot.input as Record<string, unknown>,
        manifestV2.capabilities ?? [],
        registered.pkgRoot ?? cwd,
        workdir,
        snapshot.context?.outdir,
        undefined
      );

      if (exitCode === 0) {
        ctx.presenter.info(`✓ Replay completed successfully`);
      } else {
        ctx.presenter.warn(`⚠ Replay completed with exit code ${exitCode}`);
      }

      // Compare with original result if available
      if (snapshot.result === 'error' && exitCode === 0) {
        ctx.presenter.warn(`⚠ Original run failed, but replay succeeded (bug may be fixed)`);
      } else if (snapshot.result === 'success' && exitCode !== 0) {
        ctx.presenter.warn(`⚠ Original run succeeded, but replay failed (regression detected)`);
      }

      return exitCode;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.presenter.error(`Replay failed: ${message}`);
      return 1;
    }
  },
};

