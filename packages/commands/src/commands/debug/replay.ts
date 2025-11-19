/**
 * replay command - Replay snapshot for debugging
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { loadSnapshot, listSnapshots, diffSnapshots, searchSnapshots } from '@kb-labs/plugin-runtime';
import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import { registry } from '../../registry/service';
import { box, keyValue, safeColors } from '@kb-labs/shared-cli-ui';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import type { CliCommandDecl } from '@kb-labs/plugin-manifest';

type ReplayResult = CommandResult & {
  mode?: 'list' | 'replay' | 'diff';
  snapshots?: Array<{
    id: string;
    timestamp: string;
    command: string;
    pluginId: string;
    result: any;
    error?: string;
    errorMessage?: string;
  }>;
  snapshot?: any;
  diff?: any;
};

type ReplayFlags = {
  list: { type: 'boolean'; description?: string };
  last: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
  diff: { type: 'string'; description?: string };
  plugin: { type: 'string'; description?: string };
  command: { type: 'string'; description?: string };
  error: { type: 'boolean'; description?: string };
};

export const replay = defineSystemCommand<ReplayFlags, ReplayResult>({
  name: 'replay',
  description: 'Replay command execution from snapshot',
  category: 'debug',
  examples: [
    'kb replay <snapshot-id>',
    'kb replay --list',
    'kb replay --last',
    'kb replay <id1> --diff <id2>',
    'kb replay --list --plugin @kb-labs/mind --error',
  ],
  flags: {
    list: { type: 'boolean', description: 'List all available snapshots' },
    last: { type: 'boolean', description: 'Replay the last snapshot' },
    json: { type: 'boolean', description: 'Output in JSON format' },
    diff: { type: 'string', description: 'Compare this snapshot with another' },
    plugin: { type: 'string', description: 'Filter snapshots by plugin ID' },
    command: { type: 'string', description: 'Filter snapshots by command' },
    error: { type: 'boolean', description: 'Show only snapshots with errors' },
  },
  analytics: {
    command: 'replay',
    startEvent: 'REPLAY_STARTED',
    finishEvent: 'REPLAY_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);

    // List snapshots with filters
    if (flags.list) {
      let snapshots = await listSnapshots(cwd);

      // Apply filters
      if (flags.plugin || flags.command || flags.error) {
        const filtered = await searchSnapshots(
          {
            pluginId: flags.plugin, // Type-safe: string | undefined
            command: flags.command, // Type-safe: string | undefined
            error: flags.error, // Type-safe: boolean | undefined
          },
          cwd,
        );
        snapshots = filtered;
      }

      ctx.logger?.info('Snapshots listed', { count: snapshots.length });

      return {
        ok: true,
        mode: 'list',
        snapshots: snapshots.map((s) => ({
          id: s.id,
          timestamp: s.timestamp,
          command: s.command,
          pluginId: s.pluginId,
          result: s.result,
          error: s.error?.code,
          errorMessage: s.error?.message,
        })),
      };
    }

    // Diff snapshots if requested
    if (flags.diff) { // Type-safe: string | undefined
      const snapshotId = argv[0];
      if (!snapshotId) {
        throw new Error('Please provide first snapshot ID');
      }

      const diff = await diffSnapshots(snapshotId, flags.diff, cwd);

      ctx.logger?.info('Snapshots compared', { id1: diff.id1, id2: diff.id2, differences: diff.differences.length });

      return {
        ok: true,
        mode: 'diff',
        ...diff,
      };
    }

    // Replay snapshot
    let snapshotId: string | undefined;

    if (flags.last) {
      const snapshots = await listSnapshots(cwd);
      const [latestSnapshot] = snapshots;
      if (!latestSnapshot) {
        throw new Error('No snapshots found');
      }
      snapshotId = latestSnapshot.id;
    } else if (argv.length > 0) {
      snapshotId = argv[0];
    } else {
      throw new Error('Please provide snapshot ID or use --last flag');
    }

    if (!snapshotId) {
      throw new Error('Snapshot ID is required');
    }

    // Load snapshot
    const snapshot = await loadSnapshot(snapshotId, cwd);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    ctx.logger?.info('Snapshot loaded', { snapshotId, command: snapshot.command, pluginId: snapshot.pluginId });

    // Find the plugin in registry
    const manifests = registry.listManifests?.() ?? [];
    const registered = manifests.find(
      (m) => m.manifest.manifestV2?.id === snapshot.pluginId || m.manifest.package === snapshot.pluginId,
    );

    if (!registered) {
      throw new Error(`Plugin ${snapshot.pluginId} not found in registry`);
    }

    if (!registered.available) {
      throw new Error(`Plugin ${snapshot.pluginId} is not available: ${registered.unavailableReason}`);
    }

    const manifestV2 = registered.manifest.manifestV2;
    if (!manifestV2) {
      throw new Error(`Plugin ${snapshot.pluginId} has no ManifestV2`);
    }

    // Find CLI command in manifest
    const commandId = snapshot.command.includes(':')
      ? snapshot.command.split(':', 2).pop() ?? snapshot.command
      : snapshot.command;

    const cliCommands = manifestV2.cli?.commands ?? [];
    const cliCommand: CliCommandDecl | undefined = cliCommands.find(
      (c) => c.id === commandId || c.id === snapshot.command,
    );

    if (!cliCommand || !cliCommand.handler) {
      throw new Error(`Command ${snapshot.command} not found in plugin manifest`);
    }

    // Restore workdir from snapshot
    const workdir = snapshot.context?.workdir ?? snapshot.context?.cwd ?? cwd;

    ctx.logger?.info('Replaying snapshot', { snapshotId, workdir });

    // Execute command with same input/flags
    const exitCode = await executeCommand(
      cliCommand,
      manifestV2,
      ctx as any,
      snapshot.input as Record<string, unknown>,
      manifestV2.capabilities ?? [],
      registered.pkgRoot ?? cwd,
      workdir,
      snapshot.context?.outdir,
      undefined,
    );

    const originalResult = snapshot.result;
    const replaySuccess = exitCode === 0;

    ctx.logger?.info('Replay completed', {
      snapshotId,
      exitCode,
      originalResult,
      replaySuccess,
      regression: originalResult === 'success' && !replaySuccess,
      fixed: originalResult === 'error' && replaySuccess,
    });

    return {
      ok: replaySuccess,
      mode: 'replay',
      snapshotId,
      snapshot: {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        command: snapshot.command,
        pluginId: snapshot.pluginId,
        input: snapshot.input,
        context: snapshot.context,
        result: snapshot.result,
      },
      exitCode,
      originalResult,
      replaySuccess,
      regression: originalResult === 'success' && !replaySuccess,
      fixed: originalResult === 'error' && replaySuccess,
    };
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

    // List mode
    if (resultData.mode === 'list') {
      const snapshots = resultData.snapshots;
      if (snapshots.length === 0) {
        ctx.output?.info('No snapshots found');
        return;
      }

      ctx.output?.info(`Found ${snapshots.length} snapshot(s):\n`);
      for (const snapshot of snapshots) {
        const status = snapshot.result === 'error' ? '✗' : '✓';
        const errorInfo = snapshot.error ? ` (${snapshot.error})` : '';
        ctx.output?.info(`${status} ${snapshot.id} - ${snapshot.command}${errorInfo}`);
        ctx.output?.info(`   ${snapshot.timestamp}`);
        if (snapshot.errorMessage) {
          ctx.output?.info(`   Error: ${snapshot.errorMessage}`);
        }
      }
      return;
    }

    // Diff mode
    if (resultData.mode === 'diff') {
      const diffLines = (resultData.differences ?? []).flatMap((difference: any) => [
        `  ${safeColors.dim('Field:')} ${difference.field}`,
        `    ${safeColors.error('-')} ${JSON.stringify(difference.value1, null, 2)}`,
        `    ${safeColors.success('+')} ${JSON.stringify(difference.value2, null, 2)}`,
      ]);

      const summary = keyValue({
        'Snapshot 1': resultData.id1,
        'Snapshot 2': resultData.id2,
        Differences: resultData.differences.length.toString(),
      });

      const output = box('Snapshot Comparison', [...summary, '', ...diffLines]);
      ctx.output.write(output);
      return;
    }

    // Replay mode
    if (resultData.mode === 'replay') {
      const snapshot = resultData.snapshot;
      ctx.output?.info(`Replaying snapshot: ${snapshot.id}`);
      ctx.output?.info(`Command: ${snapshot.command}`);
      ctx.output?.info(`Timestamp: ${snapshot.timestamp}`);
      ctx.output?.info(`Plugin: ${snapshot.pluginId}`);
      ctx.output?.info('');

      const workdir = snapshot.context?.workdir ?? snapshot.context?.cwd ?? getContextCwd(ctx);
      ctx.output?.info(`Replaying with:`);
      ctx.output?.info(`  Input: ${JSON.stringify(snapshot.input)}`);
      ctx.output?.info(`  Workdir: ${workdir}`);
      ctx.output?.info('');

      if (resultData.exitCode === 0) {
        ctx.output?.info(`✓ Replay completed successfully`);
      } else {
        ctx.output?.warn(`⚠ Replay completed with exit code ${resultData.exitCode}`);
      }

      // Compare with original result
      if (resultData.regression) {
        ctx.output?.warn(`⚠ Original run succeeded, but replay failed (regression detected)`);
      } else if (resultData.fixed) {
        ctx.output?.warn(`⚠ Original run failed, but replay succeeded (bug may be fixed)`);
      }
    }
  },
});
