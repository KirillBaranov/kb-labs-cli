import {
  createJsonPresenter,
  createTextPresenter,
  createContext,
  parseArgs,
  CliError,
  mapCliErrorToExitCode,
  colors,
  type ExecutionLimits,
} from "@kb-labs/cli-core";
import {
  findCommand,
  findCommandWithType,
  registerBuiltinCommands,
  renderGlobalHelpNew,
  renderGroupHelp,
  renderManifestCommandHelp,
  renderProductHelp,
  registry,
} from "@kb-labs/cli-commands";
import { createOutput } from "@kb-labs/core-sys/output";
import {
  createCliRuntime,
  type RuntimeSetupOptions,
  type MiddlewareConfig,
  type OutputFormatter,
} from "@kb-labs/cli-runtime";
import { handleLimitFlag } from "./limits";
import { getDefaultMiddlewares } from "./middlewares";
import { tryExecuteV3, createPluginContextV3ForSystemCommand } from "./v3-adapter";
import { loadEnvFile } from "./env-loader";
import { initializePlatform } from "./platform-init";
import { resolveVersion } from "./helpers/version";
import { normalizeCmdPath } from "./helpers/cmd-path";
import { shouldShowLimits } from "./helpers/flags";
import { randomUUID } from "node:crypto";
import type { PlatformContainer } from "@kb-labs/core-runtime";

type ILogger = PlatformContainer["logger"];

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

const _DEFAULT_VERSION = "0.1.0";

type LegacyLikeLogger = {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown> | Error): void;
  child(bindings: { category?: string; meta?: Record<string, unknown> }): LegacyLikeLogger;
};

function adaptPlatformLogger(logger: ILogger): LegacyLikeLogger {
  return {
    debug: (msg, meta) => logger.debug(msg, meta),
    info: (msg, meta) => logger.info(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    error: (msg, metaOrError) => {
      if (metaOrError instanceof Error) {
        logger.error(msg, metaOrError);
        return;
      }
      logger.error(msg, undefined, metaOrError);
    },
    child: (bindings) => {
      const childBindings: Record<string, unknown> = {};
      if (bindings.category) {
        childBindings.category = bindings.category;
      }
      if (bindings.meta && typeof bindings.meta === "object") {
        Object.assign(childBindings, bindings.meta);
      }
      return adaptPlatformLogger(logger.child(childBindings));
    },
  };
}

export async function executeCli(
  argv: string[],
  options: CliRuntimeOptions = {},
): Promise<number | void> {
  try {
  const cwd = options.cwd ?? process.cwd();

  // Загружаем .env файл если есть (не перезаписываем существующие переменные)
  loadEnvFile(cwd);

  // Initialize platform adapters from kb.config.json (before any plugin execution)
  const { platform, platformConfig, rawConfig } = await initializePlatform(cwd);

  // Store platformConfig globally so CLI adapter can pass it to ExecutionContext
  (globalThis as any).__KB_PLATFORM_CONFIG__ = platformConfig;

  // Store rawConfig globally so useConfig() can access it (parent process)
  (globalThis as any).__KB_RAW_CONFIG__ = rawConfig;

  // Also store in env var so child processes can access it
  if (rawConfig) {
    process.env.KB_RAW_CONFIG_JSON = JSON.stringify(rawConfig);
  }

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
  const rawLevel = String(global.logLevel ?? env.KB_LOG_LEVEL ?? 'silent').toLowerCase();
  const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;
  type LogLevel = typeof validLevels[number];
  const logLevel: LogLevel = global.debug
    ? 'debug'
    : (validLevels.includes(rawLevel as LogLevel) ? rawLevel as LogLevel : 'silent');

  // Set env vars BEFORE any logger initialization (including auto-init)
  // This ensures that even lazy-loaded loggers respect the correct level
  if (!process.env.LOG_LEVEL && !process.env.KB_LOG_LEVEL) {
    process.env.KB_LOG_LEVEL = logLevel;
  }

  // Set DEBUG_SANDBOX env var so child processes and CliAPI know about debug mode
  if (global.debug) {
    process.env.DEBUG_SANDBOX = '1';
  }

  const cliRequestId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const cliTraceId = `trace-${randomUUID()}`;
  const cliSpanId = `span-${randomUUID()}`;
  const cliInvocationId = `inv-${randomUUID()}`;

  // Use platform logger as primary runtime logger (persistent, extensions-aware)
  const platformCliLogger = platform.logger.child({
    layer: "cli",
    cwd,
    version,
    requestId: cliRequestId,
    reqId: cliRequestId,
    traceId: cliTraceId,
    spanId: cliSpanId,
    invocationId: cliInvocationId,
    argv,
  });
  const cliLogger = adaptPlatformLogger(platformCliLogger);
  platformCliLogger.info("CLI invocation started", {
    commandPath: cmdPath.join(" "),
    argsCount: argv.length,
    jsonMode: Boolean(global.json),
    quietMode: Boolean(global.quiet),
    debugMode: Boolean(global.debug),
  });

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
    if (!groupName) { return 1; }

    // Find group (e.g., "plugins")
    const maybeGroup = find([groupName]);

    if (maybeGroup && typeof maybeGroup === 'object' && 'commands' in maybeGroup && Array.isArray((maybeGroup as any).commands)) {
      // Search through group's commands for matching name or alias
      for (const groupCmd of maybeGroup.commands) {
        if (groupCmd.name === commandName || (commandName && groupCmd.aliases?.includes(commandName))) {
          cmd = groupCmd;
          normalizedCmdPath = [groupCmd.name];
          break;
        }
      }
    }
  }

  // If command not found and cmdPath has more than 2 elements, try manifest command with colons
  // This handles nested commands like "agent trace stats" → "agent:trace:stats"
  if (!cmd && cmdPath.length > 2) {
    // First try to find as manifest command (e.g., agent:trace:stats)
    const maybeManifestId = cmdPath.join(":");
    const manifestCmd = registryStore.getManifestCommand(maybeManifestId);

    if (manifestCmd && manifestCmd.available && !manifestCmd.shadowed) {
      // Found manifest command! Use it as cmd
      // We'll handle this via V3 adapter later in execution
      cmd = manifestCmd as any; // Will be processed by findCommandWithType
      normalizedCmdPath = cmdPath;
    } else {
      // Fall back to trying shorter paths
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
  }
  
  const presenter = global.json
    ? jsonPresenterFactory()
    : textPresenterFactory(global.quiet);
  
  // Create unified output and logger
  const output = createOutput({
    verbosity: global.quiet ? 'quiet' : global.debug ? 'debug' : 'normal',
    json: global.json,
    format: global.debug ? 'human' : 'human',
    category: 'cli',
  });
  
  const logger = cliLogger.child({
    category: "bootstrap",
    meta: {
      service: "runtime-bootstrap",
    },
  });

  // Debug logging AFTER logger is properly initialized
  logger.debug('[bootstrap] rawConfig', { state: rawConfig ? 'EXISTS' : 'UNDEFINED' });
  if (rawConfig) {
    logger.debug('[bootstrap] rawConfig keys', { keys: Object.keys(rawConfig) });
  }
  logger.debug('[bootstrap] Stored in globalThis.__KB_RAW_CONFIG__', {
    state: (globalThis as any).__KB_RAW_CONFIG__ ? 'EXISTS' : 'UNDEFINED',
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
    profileId: global.profile, // Pass global --profile flag or KB_PROFILE env var
    verbosity: global.quiet ? 'quiet' : (global.verbose ? 'verbose' : 'normal'),
    jsonMode: global.json || false,
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
        const lines: string[] = [];
        lines.push(colors.bold(`${groupPrefix} groups:`));
        lines.push('');

        for (const group of matchingGroups) {
          lines.push(`  ${colors.cyan(group.name.padEnd(20))}  ${colors.dim(group.describe ?? '')}`);
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

  if (typeof cmd === 'object' && cmd !== null && 'commands' in cmd && Array.isArray((cmd as any).commands)) {
    if (global.json) {
      presenter.json({
        ok: false,
        error: {
          code: "CMD_NOT_FOUND",
          message: `Group '${(cmd as any).name}' requires a subcommand`,
        },
      });
    } else {
      presenter.write(renderGroupHelp(cmd as any));
    }
    return 0;
  }

  try {
    const runtime = await runtimeFactory(runtimeInitOptions);
    // Use cliContext instead of runtime.context because runtime.context doesn't have output
    const context = cliContext;

    if (global.json && typeof (presenter as any).setContext === 'function') {
      (presenter as any).setContext(context);
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

    return await runtime.middleware.execute(context, async () => {
      // Get command with type information for secure routing
      const result = findCommandWithType(normalizedCmdPath);

      if (!result) {
        throw new Error(`Command ${normalizedCmdPath.join(":")} not found in registry`);
      }

      // Route based on command type
      if (result.type === 'system') {
        // System command - execute in-process via cmd.run()
        if ('run' in result.cmd) {
          // Convert SystemContext → PluginContextV3 for system commands
          const v3Context = createPluginContextV3ForSystemCommand(context, platform);
          const exitCode = await result.cmd.run(v3Context, actualRest, { ...global, ...flagsObj });
          return typeof exitCode === 'number' ? exitCode : 0;
        }

        // Shouldn't happen - system commands must have run()
        throw new Error(`System command ${normalizedCmdPath.join(":")} missing run() method`);
      }

      if (result.type === 'plugin') {
        // Plugin command - execute in subprocess via V3 adapter
        const manifestCmd = registryStore.getManifestCommand(normalizedCmdPath.join(":"));
        const v3ExitCode = await tryExecuteV3({
          context,
          commandId: normalizedCmdPath.join(":"),
          argv: actualRest,
          flags: { ...global, ...flagsObj },
          manifestCmd,
          platform,
        });

        // If V3 execution succeeded, return its exit code
        if (v3ExitCode !== undefined) {
          return v3ExitCode;
        }

        // V3 execution unavailable - this is an error
        throw new Error(`Plugin command ${normalizedCmdPath.join(":")} is not available for execution. Ensure the command has a handlerPath in its manifest.`);
      }

      // Unknown type - shouldn't happen
      throw new Error(`Unknown command type: ${result.type}`);
    });
  } catch (error: unknown) {
    return handleExecutionError(error, presenter);
  }
  } catch (outerError: unknown) {
    throw outerError;
  }
}

function handleExecutionError(
  error: unknown,
  presenter: any,
): number {
  if (error instanceof CliError) {
    const exitCode = mapCliErrorToExitCode(error.code);
    const diagnostics: unknown[] = [];

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
  const diagnostics: unknown[] = [];

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
