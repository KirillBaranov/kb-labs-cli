import {
  createJsonPresenter,
  createTextPresenter,
  parseArgs,
  CliError,
  mapCliErrorToExitCode,
  type ExecutionLimits,
} from "@kb-labs/cli-core/public";
import {
  findCommand,
  registerBuiltinCommands,
  renderGlobalHelpNew,
  renderGroupHelp,
  renderManifestCommandHelp,
  renderProductHelp,
  registry,
  type CommandGroup,
} from "@kb-labs/cli-commands";
import { initCliLogging } from "@kb-labs/plugin-adapter-cli";
import type { LogLevel } from "@kb-labs/core-sys";
import {
  createCliRuntime,
  type RuntimeSetupOptions,
  type MiddlewareConfig,
  type OutputFormatter,
} from "@kb-labs/cli-runtime";
import { getDefaultMiddlewares } from "./middlewares";

type RuntimeInitOptions = RuntimeSetupOptions;
type CliRuntimeInstance = Awaited<ReturnType<typeof createCliRuntime>>;
type CliExecutionContext = CliRuntimeInstance["context"];

export interface CliRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  version?: string;
  initLogging?: (level: LogLevel) => void;
  cwd?: string;
  registerBuiltinCommands?: (
    input: { cwd: string; env: NodeJS.ProcessEnv },
  ) => Promise<void> | void;
  parseArgs?: typeof parseArgs;
  findCommand?: typeof findCommand;
  registry?: typeof registry;
  createJsonPresenter?: typeof createJsonPresenter;
  createTextPresenter?: typeof createTextPresenter;
  createRuntime?: (
    options: RuntimeInitOptions,
  ) => Promise<CliRuntimeInstance>;
  createRuntimeContext?: (
    options: RuntimeInitOptions,
  ) => Promise<CliExecutionContext>;
  runtimeExecutionLimits?: ExecutionLimits;
  runtimeMiddlewares?: MiddlewareConfig[];
  runtimeFormatters?: OutputFormatter[];
}

const DEFAULT_VERSION = "0.1.0";

export async function executeCli(
  argv: string[],
  options: CliRuntimeOptions = {},
): Promise<number | void> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const initLogging = options.initLogging ?? initCliLogging;
  const version = resolveVersion(options.version, env);
  const parse = options.parseArgs ?? parseArgs;
  const find = options.findCommand ?? findCommand;
  const registryStore = options.registry ?? registry;
  const jsonPresenterFactory =
    options.createJsonPresenter ?? createJsonPresenter;
  const textPresenterFactory =
    options.createTextPresenter ?? createTextPresenter;
  const runtimeFactory =
    options.createRuntime ??
    (async (runtimeOptions: RuntimeInitOptions) => {
      const providedContext = options.createRuntimeContext
        ? await options.createRuntimeContext(runtimeOptions)
        : undefined;
      return createCliRuntime({
        ...runtimeOptions,
        context: providedContext,
      });
    });
  initLogging(resolveLogLevel(env.KB_LOG_LEVEL));
  const registerCommands =
    options.registerBuiltinCommands ?? registerBuiltinCommands;
  await registerCommands({ cwd, env });

  const { cmdPath, rest, global, flagsObj } = parse(argv);

  initLogging(resolveLogLevel(global.logLevel ?? env.KB_LOG_LEVEL));

  const normalizedCmdPath = normalizeCmdPath(cmdPath);
  const presenter = global.json
    ? jsonPresenterFactory()
    : textPresenterFactory(global.quiet);
  const runtimeMiddlewares =
    options.runtimeMiddlewares ?? getDefaultMiddlewares();
  const runtimeInitOptions: RuntimeInitOptions = {
    presenter,
    env,
    cwd,
    executionLimits: options.runtimeExecutionLimits,
    middlewares: runtimeMiddlewares,
    formatters: options.runtimeFormatters,
  };

  if (global.help && cmdPath.length === 0) {
    if (global.json) {
      presenter.json({
        ok: false,
        error: {
          code: "CMD_NOT_FOUND",
          message: "Use text mode for help display",
        },
      });
    } else {
      presenter.write(renderGlobalHelpNew(registryStore));
    }
    return 0;
  }

  if (global.version) {
    if (global.json) {
      presenter.json({
        ok: true,
        version,
      });
    } else {
      presenter.write(version);
    }
    return 0;
  }

  const cmd = find(normalizedCmdPath);

  if (cmdPath.length === 1 && cmdPath[0]) {
    const productCommands = registryStore.getCommandsByGroup(cmdPath[0]);
    if (productCommands.length > 0) {
      if (global.json) {
        presenter.json({
          ok: false,
          error: {
            code: "CMD_NOT_FOUND",
            message: `Product '${cmdPath[0]}' requires a subcommand`,
          },
        });
      } else {
        presenter.write(renderProductHelp(cmdPath[0], productCommands));
      }
      return 0;
    }
  }

  if (!cmd) {
    const msg = `Unknown command: ${
      normalizedCmdPath.join(" ") || "(none)"
    }`;
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

  if (isCommandGroup(cmd)) {
    if (global.json) {
      presenter.json({
        ok: false,
        error: {
          code: "CMD_NOT_FOUND",
          message: `Group '${cmd.name}' requires a subcommand`,
        },
      });
    } else {
      presenter.write(renderGroupHelp(cmd));
    }
    return 0;
  }

  let ctx: CliExecutionContext | undefined;

  try {
    const runtime = await runtimeFactory(runtimeInitOptions);
    const context = runtime.context;
    ctx = context;

    if (global.json && hasSetContext(presenter)) {
      presenter.setContext(context);
    }

    if (global.help && cmdPath.length > 0) {
      const manifestCmd = registryStore.getManifestCommand(
        normalizedCmdPath.join(":"),
      );
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

    const exitCode = await runtime.middleware.execute(context, async () => {
      const result = await cmd.run(context, rest, { ...global, ...flagsObj });

      if (global.json && !context.sentJSON) {
        presenter.json({
          ok: true,
          data: result ?? null,
          ...(context.diagnostics?.length > 0 && {
            warnings: context.diagnostics,
          }),
        });
      }

      if (typeof result === "number") {
        return result;
      }
      return 0;
    });
    return exitCode;
  } catch (error: unknown) {
    return handleExecutionError(error, presenter, ctx);
  }
}

function resolveVersion(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  if (explicit) {
    return explicit;
  }
  return env.CLI_VERSION ?? DEFAULT_VERSION;
}

function normalizeCmdPath(argvCmd: string[]): string[] {
  if (argvCmd.length === 1 && argvCmd[0]?.includes(":")) {
    const cmdName = argvCmd[0];
    const parts = cmdName.split(":");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return argvCmd;
    }
    if (parts.length >= 3) {
      return parts;
    }
  }
  return argvCmd;
}

function resolveLogLevel(level: unknown): LogLevel {
  if (!level) {
    return "info";
  }
  const normalized = String(level).toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "info";
}

function isCommandGroup(
  input: unknown,
): input is CommandGroup {
  return (
    typeof input === "object" &&
    input !== null &&
    "commands" in input
  );
}

function hasSetContext(
  presenter: unknown,
): presenter is { setContext(ctx: CliExecutionContext): void } {
  return (
    typeof presenter === "object" &&
    presenter !== null &&
    "setContext" in presenter &&
    typeof (presenter as any).setContext === "function"
  );
}

function handleExecutionError(
  error: unknown,
  presenter: any,
  ctx: CliExecutionContext | undefined,
): number {
  if (error instanceof CliError) {
    const exitCode = mapCliErrorToExitCode(error.code);
    const diagnostics = ctx?.diagnostics ?? [];

    if (typeof presenter.json === "function") {
      presenter.json({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details != null && { details: error.details }),
        },
        ...(diagnostics.length > 0 && {
          warnings: diagnostics,
        }),
      });
    } else if (typeof presenter.error === "function") {
      presenter.error(`${error.code}: ${error.message}`);
    }
    return exitCode;
  }

  const message = String((error as any)?.message ?? error);
  const diagnostics = ctx?.diagnostics ?? [];

  if (typeof presenter.json === "function") {
    presenter.json({
      ok: false,
      error: { message },
      ...(diagnostics.length > 0 && {
        warnings: diagnostics,
      }),
    });
  } else if (typeof presenter.error === "function") {
    presenter.error(message);
  }
  return 1;
}

