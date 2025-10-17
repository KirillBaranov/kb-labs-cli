import { parseArgs } from "@kb-labs/cli-core";
import { CliError, mapCliErrorToExitCode } from "@kb-labs/cli-core";
import {
  createTextPresenter,
  createJsonPresenter,
  createContext,
} from "@kb-labs/cli-core";
import { findCommand, registerBuiltinCommands, renderGroupHelp, renderGlobalHelp, registry, type CommandGroup, type Command } from "@kb-labs/cli-commands";

function normalizeCmdPath(argvCmd: string[]): string[] {
  if (argvCmd.length === 1 && argvCmd[0]?.includes(":")) {
    const parts = argvCmd[0].split(":");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return [parts[0], parts[1]];
    }
  }
  return argvCmd;
}

export async function run(argv: string[]): Promise<number | void> {
  // Auto-register builtin commands
  registerBuiltinCommands();
  const { cmdPath, rest, global, flagsObj } = parseArgs(argv);

  // Normalize command path for legacy support
  const normalizedCmdPath = normalizeCmdPath(cmdPath);

  const presenter = global.json ? createJsonPresenter() : createTextPresenter(global.quiet);

  // Handle global --help flag
  if (global.help) {
    if (global.json) {
      // For JSON mode, preserve existing behavior - don't show group help
      presenter.json({
        ok: false,
        error: { code: "CMD_NOT_FOUND", message: "Use text mode for help display" },
      });
    } else {
      // Use new help generator for text mode
      const groups = registry.listGroups();
      const standalone = registry.list().filter(cmd => !cmd.category);
      presenter.write(renderGlobalHelp(groups, standalone));
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

  try {
    const code = await cmd.run(ctx, rest, { ...global, ...flagsObj });
    if (typeof code === "number") {
      return code;
    }
  } catch (e: any) {
    if (e instanceof CliError) {
      const exitCode = mapCliErrorToExitCode(e.code);
      const msg = `${e.code}: ${e.message}`;
      if (global.json) {
        presenter.json({
          ok: false,
          error: { code: e.code, message: e.message },
        });
      } else {
        presenter.error(msg);
      }
      return exitCode;
    }
    const msg = String(e?.message || e);
    if (global.json) {
      presenter.json({ ok: false, error: { message: msg } });
    } else {
      presenter.error(msg);
    }
    return 1;
  }
}
