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

  const presenter = global.json ? createJsonPresenter() : createTextPresenter();

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
