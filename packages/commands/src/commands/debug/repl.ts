/**
 * repl command - Interactive REPL for plugin commands
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import { registry } from '../../registry/service';
import type { ManifestV2, CliCommandDecl } from '@kb-labs/plugin-manifest';
import * as readline from 'node:readline';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { registerShutdownHook } from '../../utils/shutdown';

interface ReplSession {
  id: string;
  timestamp: string;
  command: string;
  pluginId: string;
  runs: Array<{
    id: string;
    timestamp: string;
    input: Record<string, unknown>;
    exitCode: number;
    duration: number;
  }>;
}

type ReplResult = CommandResult & {
  command?: string;
  pluginId?: string;
  ready?: boolean;
  sessionId?: string;
};

type ReplFlags = {
  json: { type: 'boolean'; description?: string };
};

export const repl = defineSystemCommand<ReplFlags, ReplResult>({
  name: 'repl',
  description: 'Interactive REPL for plugin commands',
  category: 'debug',
  examples: ['kb repl mind:query', 'kb repl mind:init'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'repl',
    startEvent: 'REPL_STARTED',
    finishEvent: 'REPL_FINISHED',
  },
  async handler(ctx, argv, flags) {
    // Parse command name (e.g., "mind:query")
    if (argv.length === 0) {
      throw new Error('Please provide command name (e.g., mind:query)');
    }

    const commandName = argv[0]!;
    const [pluginName, commandIdRaw] = commandName.includes(':')
      ? commandName.split(':', 2)
      : [commandName, ''];
    const commandId = commandIdRaw ?? '';

    // Find command in registry
    const manifests = registry.listManifests?.() ?? [];
    const registered = manifests.find((m) => {
      const manifestId = m.manifest.manifestV2?.id ?? m.manifest.package;
      return manifestId === pluginName || m.manifest.package === pluginName;
    });

    if (!registered) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    if (!registered.available) {
      throw new Error(`Plugin ${pluginName} is not available: ${registered.unavailableReason}`);
    }

    const manifestV2 = registered.manifest.manifestV2 as ManifestV2 | undefined;
    if (!manifestV2) {
      throw new Error(`Plugin ${pluginName} has no ManifestV2`);
    }

    // Find CLI command
    const cliCommands = manifestV2.cli?.commands ?? [];
    const cliCommand: CliCommandDecl | undefined = commandId
      ? cliCommands.find((c) => c.id === commandId)
      : cliCommands[0];

    if (!cliCommand || !cliCommand.handler) {
      throw new Error(`Command ${commandName} not found in plugin manifest`);
    }

    if (flags.json) { // Type-safe: boolean
      return {
        ok: true,
        command: commandName,
        pluginId: manifestV2.id,
        ready: true,
      };
    }

    // Start REPL session
    const sessionId = `repl-${Date.now()}`;
    const session: ReplSession = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      command: commandName,
      pluginId: manifestV2.id,
      runs: [],
    };
    let sessionSaved = false;

    ctx.output?.info(`🔧 Interactive REPL for ${commandName}`);
    ctx.output?.info(`Plugin: ${manifestV2.id}@${manifestV2.version || 'unknown'}`);
    ctx.output?.info('');
    ctx.output?.info('Commands:');
    ctx.output?.info('  run <flags>  - Run command with flags (e.g., run --query "test")');
    ctx.output?.info('  compare <n> <m> - Compare run n and m');
    ctx.output?.info('  reload      - Reload handler from disk');
    ctx.output?.info('  history     - Show run history');
    ctx.output?.info('  exit        - Exit REPL');
    ctx.output?.info('');
    ctx.output?.info('Type "exit" to quit, or use Ctrl+C');
    ctx.output?.info('');

    // Setup readline interface with history support
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'kb-repl> ',
      historySize: 1000,
    });

    // History for commands (for custom history navigation)
    const history: string[] = [];
    let _historyIndex = -1;
    const _currentLine = '';

    // Setup history navigation (Ctrl+P/Ctrl+N or Up/Down arrows)
    // Note: readline already handles this, but we keep track for autocomplete

    // Helper to parse REPL command
    const parseCommand = (line: string): { cmd: string; args: string[] } => {
      const trimmed = line.trim();
      if (!trimmed) {
        return { cmd: '', args: [] };
      }
      const parts = trimmed.split(/\s+/);
      return { cmd: parts[0] || '', args: parts.slice(1) };
    };

    // Helper to parse flags from args
    const parseFlags = (args: string[]): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) {
          continue;
        }
        if (arg.startsWith('--')) {
          const key = arg.slice(2).replace(/-/g, '');
          const next = args[i + 1];
          if (typeof next === 'string' && !next.startsWith('-')) {
            result[key] = next;
            i++;
          } else {
            result[key] = true;
          }
        } else if (arg.startsWith('-')) {
          const key = arg.slice(1);
          const next = args[i + 1];
          if (typeof next === 'string' && !next.startsWith('-')) {
            result[key] = next;
            i++;
          } else {
            result[key] = true;
          }
        }
      }
      return result;
    };

    // Get available flags for autocomplete
    const getAvailableFlags = (): string[] => {
      const results: string[] = [];
      for (const flag of cliCommand.flags ?? []) {
        results.push(`--${flag.name}`);
        if (flag.alias) {
          results.push(`-${flag.alias}`);
        }
      }
      return results;
    };

    // Autocomplete helper
    const completer = (line: string): [string[], string] => {
      const trimmed = line.trim();
      const parts = trimmed ? trimmed.split(/\s+/) : [];
      const cmd = parts[0] ?? '';
      const lastPart = parts.length > 0 ? parts[parts.length - 1] ?? '' : '';

      // Autocomplete for commands
      if (parts.length === 1) {
        const commands = ['run', 'compare', 'reload', 'history', 'exit', 'help'];
        const matches = commands.filter(c => c.startsWith(cmd.toLowerCase()));
        return [matches.length > 0 ? matches : commands, cmd];
      }

      // Autocomplete for flags after 'run'
      if (cmd === 'run' || cmd === 'r') {
        const availableFlags = getAvailableFlags();
        const matches = availableFlags.filter(f => f.startsWith(lastPart));
        return [matches.length > 0 ? matches : availableFlags, lastPart];
      }

      return [[], ''];
    };

    // Setup autocomplete
    (rl as any).setCompleter(completer);

    // Helper to save session
    const cwd = getContextCwd(ctx);
    const saveSession = async () => {
      try {
        const sessionsDir = path.join(cwd, '.kb', 'debug', 'tmp', 'sessions');
        await fs.mkdir(sessionsDir, { recursive: true });
        const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
        await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
      } catch {
        // Ignore errors
      }
    };

    // REPL loop
    rl.on('line', async (line: string) => {
      // Track history
      if (line.trim()) {
        history.push(line);
         _historyIndex = history.length;
      }

      const { cmd, args } = parseCommand(line);
      const trimmedCmd = cmd.toLowerCase();

      if (trimmedCmd === 'exit' || trimmedCmd === 'quit' || trimmedCmd === 'q') {
        await saveSession();
        ctx.output?.info('👋 Goodbye!');
        rl.close();
        return;
      }

      if (trimmedCmd === 'run' || trimmedCmd === 'r') {
        const runFlags = parseFlags(args);
        const runId = `run-${Date.now()}`;
        const startTime = Date.now();

        try {
          ctx.output?.info(`Running ${commandName}...`);

          const exitCode = await executeCommand(
            cliCommand,
            manifestV2,
            ctx as any,
            runFlags,
            manifestV2.capabilities ?? [],
            registered.pkgRoot ?? cwd,
            cwd,
            undefined,
            undefined
          );

          const duration = Date.now() - startTime;

          session.runs.push({
            id: runId,
            timestamp: new Date().toISOString(),
            input: runFlags,
            exitCode,
            duration,
          });

          ctx.output?.info(`✓ Run completed in ${duration}ms (exit code: ${exitCode})`);
          ctx.output?.info(`  Run ID: ${runId}`);
          ctx.output?.info('');
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.output?.error(`Run failed: ${message}`);
          ctx.output?.info('');
        }

        rl.prompt();
        return;
      }

      if (trimmedCmd === 'compare' || trimmedCmd === 'c') {
        if (args.length < 2) {
          ctx.output?.error('Usage: compare <run-n> <run-m>');
          ctx.output?.info('Use "history" to see run numbers');
          rl.prompt();
          return;
        }

        const n = Number.parseInt(args[0] ?? '', 10) - 1;
        const m = Number.parseInt(args[1] ?? '', 10) - 1;

        if (n < 0 || m < 0 || n >= session.runs.length || m >= session.runs.length) {
          ctx.output?.error('Invalid run numbers');
          rl.prompt();
          return;
        }

        const runN = session.runs[n]!;
        const runM = session.runs[m]!;

        ctx.output?.info(`Comparing run ${n + 1} and ${m + 1}:`);
        ctx.output?.info(`  Run ${n + 1}: exit=${runN.exitCode}, duration=${runN.duration}ms`);
        ctx.output?.info(`  Run ${m + 1}: exit=${runM.exitCode}, duration=${runM.duration}ms`);

        const inputDiff = JSON.stringify(runN.input) !== JSON.stringify(runM.input);
        if (inputDiff) {
          ctx.output?.info('  Input differences:');
          ctx.output?.info(`    Run ${n + 1}: ${JSON.stringify(runN.input)}`);
          ctx.output?.info(`    Run ${m + 1}: ${JSON.stringify(runM.input)}`);
        }
        ctx.output?.info('');

        rl.prompt();
        return;
      }

      if (trimmedCmd === 'reload' || trimmedCmd === 'rl') {
        ctx.output?.info('Reloading handler from disk...');
        // TODO: Implement actual reload (invalidate module cache)
        ctx.output?.warn('⚠ Reload not yet implemented (requires module cache invalidation)');
        ctx.output?.info('');
        rl.prompt();
        return;
      }

      if (trimmedCmd === 'history' || trimmedCmd === 'h') {
        if (session.runs.length === 0) {
          ctx.output?.info('No runs yet');
        } else {
          ctx.output?.info(`Run history (${session.runs.length} runs):`);
          session.runs.forEach((run, i) => {
            ctx.output?.info(`  ${i + 1}. ${run.id} - exit=${run.exitCode}, ${run.duration}ms`);
            ctx.output?.info(`     Input: ${JSON.stringify(run.input)}`);
          });
        }
        ctx.output?.info('');
        rl.prompt();
        return;
      }

      if (trimmedCmd === '' || trimmedCmd === 'help') {
        ctx.output?.info('Commands:');
        ctx.output?.info('  run <flags>     - Run command (e.g., run --query "test")');
        ctx.output?.info('  compare <n> <m> - Compare two runs');
        ctx.output?.info('  reload          - Reload handler');
        ctx.output?.info('  history         - Show history');
        ctx.output?.info('  exit            - Exit');
        ctx.output?.info('');
        rl.prompt();
        return;
      }

      ctx.output?.warn(`Unknown command: ${trimmedCmd}`);
      ctx.output?.info('Type "help" for available commands');
      ctx.output?.info('');
      rl.prompt();
    });

    const handleShutdown = async () => {
      if (sessionSaved) {
        return;
      }
      await saveSession();
      sessionSaved = true;
    };

    rl.on('close', async () => {
      await handleShutdown();
    });

    registerShutdownHook(async () => {
      await handleShutdown();
      ctx.output?.info('\n👋 Goodbye!');
      rl.close();
    });

    rl.prompt();
    return new Promise(() => {});
  },
  formatter(result, ctx, flags) {
    if (flags.json && result) {
      ctx.output?.json(result);
    }
    // Interactive mode is handled in handler
  },
});

