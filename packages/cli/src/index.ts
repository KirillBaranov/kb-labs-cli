import { parseArgs } from "@kb-labs/cli-core";
import { CliError, mapCliErrorToExitCode } from "@kb-labs/cli-core";
import {
  createTextPresenter,
  createJsonPresenter,
  createContext,
} from "@kb-labs/cli-core";
import { findCommand, registerBuiltinCommands, renderGroupHelp, renderProductHelp, renderGlobalHelpNew, renderManifestCommandHelp, registry, type CommandGroup } from "@kb-labs/cli-commands";

function normalizeCmdPath(argvCmd: string[]): string[] {
  // First try exact match (for commands like "plugins:doctor")
  if (argvCmd.length === 1 && argvCmd[0]?.includes(":")) {
    const cmdName = argvCmd[0];
    // Check if it's a valid command ID format (namespace:command)
    const parts = cmdName.split(":");
    if (parts.length === 2 && parts[0] && parts[1]) {
      // Try exact match first, then fallback to split format
      return argvCmd; // Keep original for exact match
    }
    // For 3+ parts (namespace:group:command), split it
    if (parts.length >= 3) {
      return parts;
    }
  }
  return argvCmd;
}

export async function run(argv: string[]): Promise<number | void> {
  // Auto-register builtin commands (now async)
  await registerBuiltinCommands();
  const { cmdPath, rest, global, flagsObj } = parseArgs(argv);

  // Normalize command path for legacy support
  const normalizedCmdPath = normalizeCmdPath(cmdPath);

  const presenter = global.json ? createJsonPresenter() : createTextPresenter(global.quiet);

  // Handle global --help flag
  if (global.help && cmdPath.length === 0) {
    if (global.json) {
      // For JSON mode, preserve existing behavior - don't show group help
      presenter.json({
        ok: false,
        error: { code: "CMD_NOT_FOUND", message: "Use text mode for help display" },
      });
    } else {
      // Use new help generator for text mode
      presenter.write(renderGlobalHelpNew(registry));
    }
    return 0;
  }

  // Handle global --version flag
  if (global.version) {
    const version = process.env.CLI_VERSION || "0.1.0";
    if (global.json) {
      presenter.json({
        ok: true,
        version: version
      });
    } else {
      presenter.write(version);
    }
    return 0;
  }

  const cmd = findCommand(normalizedCmdPath);
  
  // Handle product-level help (for groups from manifests) - check before cmd existence
  if (cmdPath.length === 1 && cmdPath[0]) {
    const productCommands = registry.getCommandsByGroup(cmdPath[0]);
    if (productCommands.length > 0) {
      if (global.json) {
        presenter.json({
          ok: false,
          error: { code: "CMD_NOT_FOUND", message: `Product '${cmdPath[0]}' requires a subcommand` },
        });
      } else {
        presenter.write(renderProductHelp(cmdPath[0], productCommands));
      }
      return 0;
    }
  }
  
  if (!cmd) {
    const msg = `Unknown command: ${normalizedCmdPath.join(" ") || "(none)"}`;
    if (global.json) {
      presenter.json({
        ok: false,
        error: { code: "CMD_NOT_FOUND", message: msg },
      });
    } else {
      presenter.error(msg);
    }
    return 1;
  }

  // Handle group commands (show group help)
  if ('commands' in cmd) {
    const group = cmd as CommandGroup;
    if (global.json) {
      // In JSON mode, don't show group help - return error as before
      presenter.json({
        ok: false,
        error: { code: "CMD_NOT_FOUND", message: `Group '${group.name}' requires a subcommand` },
      });
    } else {
      // Show group help in text mode
      presenter.write(renderGroupHelp(group));
    }
    return 0;
  }

  const ctx = await createContext({ presenter });
  
  // Link context to JSON presenter for sentJSON flag
  if (global.json && 'setContext' in presenter) {
    (presenter as any).setContext(ctx);
  }

  // Handle --help flag for manifest-based commands
  if (global.help && cmdPath.length > 0) {
    // Check if this is a manifest-based command
    const manifestCmd = registry.getManifestCommand(normalizedCmdPath.join(':'));
    if (manifestCmd) {
      if (global.json) {
        presenter.json({
          ok: true,
          command: manifestCmd.manifest.id,
          manifest: {
            describe: manifestCmd.manifest.describe,
            longDescription: manifestCmd.manifest.longDescription,
            flags: manifestCmd.manifest.flags,
            examples: manifestCmd.manifest.examples,
            aliases: manifestCmd.manifest.aliases,
          },
        });
      } else {
        presenter.write(renderManifestCommandHelp(manifestCmd));
      }
      return 0;
    }
  }

  try {
    const result = await cmd.run(ctx, rest, { ...global, ...flagsObj });

    // Централизованная обработка результата
    if (global.json) {
      if (!ctx.sentJSON) {
        // Команда не вызвала presenter.json() - оборачиваем сами
        presenter.json({
          ok: true,
          data: result ?? null,
          ...(ctx.diagnostics?.length > 0 && { warnings: ctx.diagnostics }),
        });
      }
      // Если ctx.sentJSON === true, команда сама вывела JSON
    }

    // Возвращаем exit code
    if (typeof result === 'number') {
      return result;
    }
    return 0;

  } catch (e: any) {
    if (e instanceof CliError) {
      const exitCode = mapCliErrorToExitCode(e.code);

      if (global.json) {
        presenter.json({
          ok: false,
          error: {
            code: e.code,
            message: e.message,
            ...(e.details != null && { details: e.details }),
          },
          ...(ctx.diagnostics?.length > 0 && { warnings: ctx.diagnostics }),
        });
      } else {
        presenter.error(`${e.code}: ${e.message}`);
      }
      return exitCode;
    }

    // Generic error
    const msg = String(e?.message || e);
    if (global.json) {
      presenter.json({
        ok: false,
        error: { message: msg },
        ...(ctx.diagnostics?.length > 0 && { warnings: ctx.diagnostics }),
      });
    } else {
      presenter.error(msg);
    }
    return 1;
  }
}
