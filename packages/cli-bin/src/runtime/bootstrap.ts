import {
  createJsonPresenter,
  createTextPresenter,
  createContext,
  parseArgs,
  CliError,
  mapCliErrorToExitCode,
  type ExecutionLimits,
} from "@kb-labs/cli-core";
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
import { initLogging, getLogger } from "@kb-labs/core-sys/logging";
import { createOutput } from "@kb-labs/core-sys/output";
import type { LogLevel } from "@kb-labs/core-sys";
import {
  createCliRuntime,
  type RuntimeSetupOptions,
  type MiddlewareConfig,
  type OutputFormatter,
} from "@kb-labs/cli-runtime";
import { handleLimitFlag } from "./limits";
import { getDefaultMiddlewares } from "./middlewares";
import { loadEnvFile } from "./env-loader";
import { initializePlatform } from "./platform-init";

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

  // Initialize platform adapters from kb.config.json (before any plugin execution)
  const platformConfig = await initializePlatform(cwd);

  // Store platformConfig globally so CLI adapter can pass it to ExecutionContext
  (globalThis as any).__KB_PLATFORM_CONFIG__ = platformConfig;

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
  // Default to 'silent' to completely suppress logs (user can use --debug for full logs)
  const logLevel = global.debug
    ? 'debug'
    : resolveLogLevel(global.logLevel ?? env.KB_LOG_LEVEL ?? 'silent');

  // Set env vars BEFORE any logger initialization (including auto-init)
  // This ensures that even lazy-loaded loggers respect the correct level
  if (!process.env.LOG_LEVEL && !process.env.KB_LOG_LEVEL) {
    process.env.KB_LOG_LEVEL = logLevel;
  }

  // Set DEBUG_SANDBOX env var so child processes and CliAPI know about debug mode
  if (global.debug) {
    process.env.DEBUG_SANDBOX = '1';
  }

  // Initialize logging with unified system
  // Force replaceSinks=true to ensure we replace any sinks from auto-init
  initLogging({
    level: logLevel,
    quiet: global.quiet,
    debug: global.debug,
    mode: global.json ? 'json' : 'auto',
    replaceSinks: true, // Always replace sinks to avoid duplicate output
  });

  // Create logger early for registerCommands - MUST be after initLogging()
  const cliLogger = getLogger('cli');

  const registerCommands =
    options.registerBuiltinCommands ?? registerBuiltinCommands;
  // Pass logger to registerCommands so it can pass to discovery and registration
  await registerCommands({ cwd, env, logger: cliLogger });

  // Try to find command by progressively shorter paths
  // e.g., ["mind", "sync", "add"] -> try ["mind", "sync", "add"], then ["mind", "sync"], then ["mind"]
  let normalizedCmdPath = normalizeCmdPath(cmdPath);
  let actualRest = rest;
  let cmd = find(normalizedCmdPath);


  // If command not found and path has 2 parts, try to find as group + command
  // e.g., ["plugins", "clear-cache"] -> group "plugins" + command "clear-cache"
  if (!cmd && cmdPath.length === 2) {
    const [groupName, commandName] = cmdPath;

    // Find group (e.g., "plugins")
    const maybeGroup = find([groupName]);

    if (maybeGroup && isCommandGroup(maybeGroup)) {
      // Search through group's commands for matching name or alias
      for (const groupCmd of maybeGroup.commands) {
        if (groupCmd.name === commandName || groupCmd.aliases?.includes(commandName)) {
          cmd = groupCmd;
          normalizedCmdPath = [groupCmd.name];
          break;
        }
      }
    }
  }

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
  
  // Create unified output and logger
  const output = createOutput({
    verbosity: global.quiet ? 'quiet' : global.debug ? 'debug' : 'normal',
    mode: global.json ? 'json' : 'auto',
    json: global.json,
    format: global.debug ? 'human' : 'human',
    category: 'cli',
  });
  
  const logger = getLogger('cli').child({
    meta: {
      cwd,
      version,
    },
  });
  
  const runtimeMiddlewares =
    options.runtimeMiddlewares ?? getDefaultMiddlewares();
  
  // Create context with output and logger
  const cliContext = await createContext({
    presenter,
    logger,
    output,
    env,
    cwd,
  });
  
  const runtimeInitOptions: RuntimeInitOptions = {
    presenter,
    env,
    cwd,
    context: cliContext, // Pass context with output and logger
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

  // Handle system groups (e.g., "kb system" shows all system:* groups)
  if (cmdPath.length === 1 && cmdPath[0] && !cmd) {
    const groupPrefix = cmdPath[0];
    const matchingGroups = registryStore.getGroupsByPrefix?.(groupPrefix);

    if (matchingGroups && matchingGroups.length > 0) {
      if (global.json) {
        presenter.json({
          ok: true,
          groups: matchingGroups.map(g => ({
            name: g.name,
            describe: g.describe,
            commands: g.commands.map(c => ({ name: c.name, describe: c.describe }))
          }))
        });
      } else {
        const colors = presenter.colors || { bold: (s: string) => s, cyan: (s: string) => s, dim: (s: string) => s };
        const lines: string[] = [];
        lines.push(colors.bold(`${groupPrefix} groups:`));
        lines.push('');

        for (const group of matchingGroups) {
          lines.push(`  ${colors.cyan(group.name.padEnd(20))}  ${colors.dim(group.describe)}`);
        }

        lines.push('');
        lines.push(colors.dim(`Use 'kb ${groupPrefix}:<group> --help' to see commands for a specific group.`));
        presenter.write(lines.join('\n'));
      }
      return 0;
    }
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
    // Use cliContext instead of runtime.context because runtime.context doesn't have output
    const context = cliContext;
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
    return "silent";  // Default: completely silent
  }
  const normalized = String(level).toLowerCase();
  if (
    normalized === "trace" ||
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error" ||
    normalized === "silent"
  ) {
    return normalized as LogLevel;
  }
  return "silent";  // Default for invalid values
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

