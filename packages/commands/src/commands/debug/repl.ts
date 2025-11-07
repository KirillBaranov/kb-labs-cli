/**
 * repl command - Interactive REPL for plugin commands
 */

import type { Command } from '../../types/types';
import { executeCommand } from '@kb-labs/plugin-adapter-cli';
import type { CliContext } from '@kb-labs/cli-core';
import { registry } from '../../utils/registry';
import type { ManifestV2, CliCommandDecl } from '@kb-labs/plugin-manifest';
import * as readline from 'node:readline';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getContextCwd } from '../../utils/context';

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

export const repl: Command = {
  name: 'repl',
  category: 'debug',
  describe: 'Interactive REPL for plugin commands',
  flags: [
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
    },
  ],
  examples: [
    'kb repl mind:query',
    'kb repl mind:init',
  ],

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>) {
    const jsonMode = Boolean(flags.json);

    // Parse command name (e.g., "mind:query")
    if (argv.length === 0) {
      ctx.presenter.error('Please provide command name (e.g., mind:query)');
      ctx.presenter.info('Usage: kb repl <plugin>:<command>');
      return 1;
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
      ctx.presenter.error(`Plugin ${pluginName} not found`);
      ctx.presenter.info('Use `kb plugins` to see available plugins');
      return 1;
    }

    if (!registered.available) {
      ctx.presenter.error(`Plugin ${pluginName} is not available: ${registered.unavailableReason}`);
      return 1;
    }

    const manifestV2 = registered.manifest.manifestV2 as ManifestV2 | undefined;
    if (!manifestV2) {
      ctx.presenter.error(`Plugin ${pluginName} has no ManifestV2`);
      return 1;
    }

    // Find CLI command
    const cliCommands = manifestV2.cli?.commands ?? [];
    const cliCommand: CliCommandDecl | undefined = commandId
      ? cliCommands.find((c) => c.id === commandId)
      : cliCommands[0];

    if (!cliCommand || !cliCommand.handler) {
      ctx.presenter.error(`Command ${commandName} not found in plugin manifest`);
      return 1;
    }

    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        command: commandName,
        pluginId: manifestV2.id,
        ready: true,
      });
      return 0;
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

    ctx.presenter.info(`🔧 Interactive REPL for ${commandName}`);
    ctx.presenter.info(`Plugin: ${manifestV2.id}@${manifestV2.version || 'unknown'}`);
    ctx.presenter.info('');
    ctx.presenter.info('Commands:');
    ctx.presenter.info('  run <flags>  - Run command with flags (e.g., run --query "test")');
    ctx.presenter.info('  compare <n> <m> - Compare run n and m');
    ctx.presenter.info('  reload      - Reload handler from disk');
    ctx.presenter.info('  history     - Show run history');
    ctx.presenter.info('  exit        - Exit REPL');
    ctx.presenter.info('');
    ctx.presenter.info('Type "exit" to quit, or use Ctrl+C');
    ctx.presenter.info('');

    // Setup readline interface with history support
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'kb-repl> ',
      historySize: 1000,
    });

    // History for commands (for custom history navigation)
    const history: string[] = [];
    let historyIndex = -1;
    let currentLine = '';

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
    const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });
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
        historyIndex = history.length;
      }

      const { cmd, args } = parseCommand(line);
      const trimmedCmd = cmd.toLowerCase();

      if (trimmedCmd === 'exit' || trimmedCmd === 'quit' || trimmedCmd === 'q') {
        await saveSession();
        ctx.presenter.info('👋 Goodbye!');
        rl.close();
        return;
      }

      if (trimmedCmd === 'run' || trimmedCmd === 'r') {
        const runFlags = parseFlags(args);
        const runId = `run-${Date.now()}`;
        const startTime = Date.now();

        try {
          ctx.presenter.info(`Running ${commandName}...`);
          
          const exitCode = await executeCommand(
            cliCommand,
            manifestV2,
            ctx,
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

          ctx.presenter.info(`✓ Run completed in ${duration}ms (exit code: ${exitCode})`);
          ctx.presenter.info(`  Run ID: ${runId}`);
          ctx.presenter.info('');
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.presenter.error(`Run failed: ${message}`);
          ctx.presenter.info('');
        }

        rl.prompt();
        return;
      }

      if (trimmedCmd === 'compare' || trimmedCmd === 'c') {
        if (args.length < 2) {
          ctx.presenter.error('Usage: compare <run-n> <run-m>');
          ctx.presenter.info('Use "history" to see run numbers');
          rl.prompt();
          return;
        }

        const n = Number.parseInt(args[0] ?? '', 10) - 1;
        const m = Number.parseInt(args[1] ?? '', 10) - 1;

        if (n < 0 || m < 0 || n >= session.runs.length || m >= session.runs.length) {
          ctx.presenter.error('Invalid run numbers');
          rl.prompt();
          return;
        }

        const runN = session.runs[n]!;
        const runM = session.runs[m]!;

        ctx.presenter.info(`Comparing run ${n + 1} and ${m + 1}:`);
        ctx.presenter.info(`  Run ${n + 1}: exit=${runN.exitCode}, duration=${runN.duration}ms`);
        ctx.presenter.info(`  Run ${m + 1}: exit=${runM.exitCode}, duration=${runM.duration}ms`);
        
        const inputDiff = JSON.stringify(runN.input) !== JSON.stringify(runM.input);
        if (inputDiff) {
          ctx.presenter.info('  Input differences:');
          ctx.presenter.info(`    Run ${n + 1}: ${JSON.stringify(runN.input)}`);
          ctx.presenter.info(`    Run ${m + 1}: ${JSON.stringify(runM.input)}`);
        }
        ctx.presenter.info('');

        rl.prompt();
        return;
      }

      if (trimmedCmd === 'reload' || trimmedCmd === 'rl') {
        ctx.presenter.info('Reloading handler from disk...');
        // TODO: Implement actual reload (invalidate module cache)
        ctx.presenter.info('⚠ Reload not yet implemented (requires module cache invalidation)');
        ctx.presenter.info('');
        rl.prompt();
        return;
      }

      if (trimmedCmd === 'history' || trimmedCmd === 'h') {
        if (session.runs.length === 0) {
          ctx.presenter.info('No runs yet');
        } else {
          ctx.presenter.info(`Run history (${session.runs.length} runs):`);
          session.runs.forEach((run, i) => {
            ctx.presenter.info(`  ${i + 1}. ${run.id} - exit=${run.exitCode}, ${run.duration}ms`);
            ctx.presenter.info(`     Input: ${JSON.stringify(run.input)}`);
          });
        }
        ctx.presenter.info('');
        rl.prompt();
        return;
      }

      if (trimmedCmd === '' || trimmedCmd === 'help') {
        ctx.presenter.info('Commands:');
        ctx.presenter.info('  run <flags>     - Run command (e.g., run --query "test")');
        ctx.presenter.info('  compare <n> <m> - Compare two runs');
        ctx.presenter.info('  reload          - Reload handler');
        ctx.presenter.info('  history         - Show history');
        ctx.presenter.info('  exit            - Exit');
        ctx.presenter.info('');
        rl.prompt();
        return;
      }

      ctx.presenter.warn(`Unknown command: ${trimmedCmd}`);
      ctx.presenter.info('Type "help" for available commands');
      ctx.presenter.info('');
      rl.prompt();
    });

    rl.on('close', async () => {
      await saveSession();
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      await saveSession();
      ctx.presenter.info('\n👋 Goodbye!');
      rl.close();
      process.exit(0);
    });

    rl.prompt();
    
    // Keep process alive
    return new Promise(() => {
      // Never resolves - keeps REPL running
    });
  },
};

