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
import { initLogging } from "@kb-labs/core-sys/logging";
import type { LogLevel } from "@kb-labs/core-sys";
import {
  createCliRuntime,
  type RuntimeSetupOptions,
  type MiddlewareConfig,
  type OutputFormatter,
} from "@kb-labs/cli-runtime";
import { handleLimitFlag } from "./limits";
import { getDefaultMiddlewares } from "./middlewares";
import { initializeTelemetry } from "./telemetry-adapter";
import { loadEnvFile } from "./env-loader";

type RuntimeInitOptions = RuntimeSetupOptions;
type CliRuntimeInstance = Awaited<ReturnType<typeof createCliRuntime>>;
type CliExecutionContext = CliRuntimeInstance["context"];

export interface CliRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  version?: string;
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
  const cwd = options.cwd ?? process.cwd();
  
  // Загружаем .env файл если есть (не перезаписываем существующие переменные)
  loadEnvFile(cwd);
  
  const env = options.env ?? process.env;
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

  // Parse args EARLY to know about --debug flag before discovery
  const { cmdPath, rest, global, flagsObj } = parse(argv);

  // Set log level based on --debug flag or explicit --log-level
  // This must happen BEFORE registerCommands/discovery
  const logLevel = global.debug 
    ? 'debug' 
    : resolveLogLevel(global.logLevel ?? env.KB_LOG_LEVEL);
  
  // Initialize logging with unified system
  initLogging({
    level: logLevel,
    quiet: global.quiet,
    debug: global.debug,
    mode: global.json ? 'json' : 'auto',
  });
  
  // Initialize telemetry for plugin-runtime (optional, won't fail if analytics unavailable)
  await initializeTelemetry().catch(() => {
    // Silently ignore if telemetry initialization fails
  });
  
  const registerCommands =
    options.registerBuiltinCommands ?? registerBuiltinCommands;
  await registerCommands({ cwd, env });

  // Try to find command by progressively shorter paths
  // e.g., ["mind", "sync", "add"] -> try ["mind", "sync", "add"], then ["mind", "sync"], then ["mind"]
  let normalizedCmdPath = normalizeCmdPath(cmdPath);
  let actualRest = rest;
  let cmd = find(normalizedCmdPath);
  
  // If command not found and cmdPath has more than 2 elements, try shorter paths
  if (!cmd && cmdPath.length > 2) {
    for (let i = cmdPath.length - 1; i >= 1; i--) {
      const shorterPath = cmdPath.slice(0, i);
      const remainingArgs = cmdPath.slice(i);
      normalizedCmdPath = normalizeCmdPath(shorterPath);
      cmd = find(normalizedCmdPath);
      if (cmd) {
        // Found command at shorter path, prepend remaining args to rest
        actualRest = [...remainingArgs, ...rest];
        break;
      }
    }
  }
  
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

  const limitRequested = shouldShowLimits(flagsObj);

  if (limitRequested) {
    return handleLimitFlag({
      cmdPath: normalizedCmdPath,
      presenter,
      registry: registryStore,
      asJson: Boolean(global.json),
    });
  }

  // Help for manifest commands with colon-separated IDs (e.g., product:setup:rollback)
  // Resolve BEFORE attempting to find the command, so that 'kb product:sub:cmd --help'
  // renders help even if the runtime treats it as a multi-part path.
  if (global.help && normalizedCmdPath.length > 0) {
    const maybeId = normalizedCmdPath.join(":");
    const manifestCmd = registryStore.getManifestCommand(maybeId);
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

  // Command already found above if cmdPath.length > 2, otherwise find it now
  if (!cmd) {
    cmd = find(normalizedCmdPath);
  }

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
      // Pass actualRest to command run so it can be forwarded to executeCommand
      const result = await (cmd.run as any)(context, actualRest, { ...global, ...flagsObj }, actualRest);

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

    // Check if presenter is in JSON mode before calling json()
    if (presenter.isJSON && typeof presenter.json === "function") {
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

  // Check if presenter is in JSON mode before calling json()
  if (presenter.isJSON && typeof presenter.json === "function") {
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

function shouldShowLimits(flags: Record<string, unknown>): boolean {
  return isTruthyBoolean(flags.limit) || isTruthyBoolean(flags.limits);
}

function isTruthyBoolean(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "y" ||
      normalized === ""
    );
  }
  return false;
}

