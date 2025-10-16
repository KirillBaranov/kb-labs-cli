import { parseArgs } from "@kb-labs/cli-core";
import { CliError, mapCliErrorToExitCode } from "@kb-labs/cli-core";
import {
  createTextPresenter,
  createJsonPresenter,
  createContext,
} from "@kb-labs/cli-core";
import { findCommand, registerBuiltinCommands } from "@kb-labs/cli-commands";

export async function run(argv: string[]): Promise<number | void> {
  // Auto-register builtin commands
  registerBuiltinCommands();
  const { cmdPath, rest, global, flagsObj } = parseArgs(argv);

  const presenter = global.json ? createJsonPresenter() : createTextPresenter(global.quiet);

  // Handle global --help flag
  if (global.help) {
    if (global.json) {
      presenter.json({
        ok: true,
        help: {
          usage: "kb [command] [options]",
          commands: [
            { name: "hello", description: "Print a friendly greeting" },
            { name: "version", description: "Show CLI version" },
            { name: "diagnose", description: "Diagnose project health and configuration" },
            { name: "init-profile", description: "Initialize a new profile configuration" },
            { name: "profiles:validate", description: "Validate a profile configuration" },
            { name: "profiles:resolve", description: "Resolve a profile configuration" },
            { name: "profiles:init", description: "Initialize a new profile configuration" },
            { name: "devlink:plan", description: "Scan and plan DevLink operations" },
            { name: "devlink:apply", description: "Apply DevLink plan" },
            { name: "devlink:freeze", description: "Freeze DevLink plan to lock file" },
            { name: "devlink:lock:apply", description: "Apply DevLink lock file" },
            { name: "devlink:undo", description: "Undo DevLink operations" },
            { name: "devlink:status", description: "Show DevLink status" },
            { name: "devlink:about", description: "Show information about DevLink" }
          ],
          globalOptions: [
            { name: "--help", description: "Show help information" },
            { name: "--version", description: "Show CLI version" },
            { name: "--json", description: "Output in JSON format" },
            { name: "--quiet", description: "Suppress detailed output, show only summary and warnings" }
          ]
        }
      });
    } else {
      presenter.write("KB Labs CLI - Project management and automation tool\n");
      presenter.write("\nUsage: kb [command] [options]\n");
      presenter.write("\nCommands:\n");
      presenter.write("  hello         Print a friendly greeting\n");
      presenter.write("  version       Show CLI version\n");
      presenter.write("  diagnose      Diagnose project health and configuration\n");
      presenter.write("  init-profile  Initialize a new profile configuration\n");
      presenter.write("  profiles:validate  Validate a profile configuration\n");
      presenter.write("  profiles:resolve   Resolve a profile configuration\n");
      presenter.write("  profiles:init      Initialize a new profile configuration\n");
      presenter.write("  devlink:plan  Scan and plan DevLink operations\n");
      presenter.write("  devlink:apply Apply DevLink plan\n");
      presenter.write("  devlink:freeze    Freeze DevLink plan to lock file\n");
      presenter.write("  devlink:lock:apply Apply DevLink lock file\n");
      presenter.write("  devlink:undo  Undo DevLink operations\n");
      presenter.write("  devlink:status Show DevLink status\n");
      presenter.write("  devlink:about Show information about DevLink\n");
      presenter.write("\nGlobal Options:\n");
      presenter.write("  --help        Show help information\n");
      presenter.write("  --version     Show CLI version\n");
      presenter.write("  --json        Output in JSON format\n");
      presenter.write("  --quiet       Suppress detailed output, show only summary and warnings\n");
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

  const cmd = findCommand(cmdPath);
  if (!cmd) {
    const msg = `Unknown command: ${cmdPath.join(" ") || "(none)"}`;
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
