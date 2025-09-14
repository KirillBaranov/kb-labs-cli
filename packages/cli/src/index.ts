import { parseArgs } from "@kb-labs/cli-core/flags";
import { CliError } from "@kb-labs/cli-core/errors";
import { createTextPresenter } from "@kb-labs/cli-core/presenter/text";
import { createJsonPresenter } from "@kb-labs/cli-core/presenter/json";
import { configureLogger, getLogger, stdoutSink, jsonSink } from "@kb-labs/core-sys/logging";
import { registry as baseRegistry, findCommand } from "@kb-labs/cli-commands/registry";
import { createPackageJsonDiscovery } from "@kb-labs/cli-adapters";
import { findRepoRoot } from "@kb-labs/core-sys/repo";

// если у тебя есть фабрика контекста — ок; иначе можно собрать объект вручную
import { createContext } from "@kb-labs/cli-core/context";

async function main(argv: string[]) {
    const { cmdPath, rest, global, flagsObj } = parseArgs(argv);

    // logger (core-sys)
    configureLogger({
        level: (global.logLevel as any) || "info",
        sinks: global.json ? [jsonSink] : [stdoutSink],
    });
    const logger = getLogger("cli");

    // presenter
    const presenter = global.json ? createJsonPresenter() : createTextPresenter();

    // базовый реестр команд
    const reg = baseRegistry.slice();

    // расширение через discovery из package.json (kbLabs.commands)
    try {
        const discovery = createPackageJsonDiscovery(process.cwd());
        const pkgs = await discovery.find();
        for (const name of pkgs) {
            try {
                const cmds = await discovery.load(name);
                if (Array.isArray(cmds) && cmds.length) reg.push(...cmds);
            } catch (e: any) {
                logger.warn?.(`[cli] Failed to load plugin '${name}': ${e?.message || String(e)}`);
            }
        }
    } catch (e: any) {
        logger.warn?.(`[cli] Plugin discovery failed: ${e?.message || String(e)}`);
    }

    // роутинг
    const cmd = findCommand(reg, cmdPath);
    if (!cmd) {
        const msg = `Unknown command: ${cmdPath.join(" ") || "(none)"}`;
        if (global.json) presenter.json({ ok: false, error: { code: "CMD_NOT_FOUND", message: msg } });
        else presenter.error(msg);
        process.exit(1);
        return;
    }

    // контекст
    const repoRoot = findRepoRoot();
    const ctx = await createContext({ presenter, logger, repoRoot, env: process.env });

    try {
        const code = await cmd.run(ctx as any, rest, { ...global, ...flagsObj });
        if (typeof code === "number") process.exit(code);
    } catch (e: any) {
        const msg = e instanceof CliError ? `${e.code}: ${e.message}` : String(e?.message || e);
        if (global.json) presenter.json({ ok: false, error: { message: msg } });
        else presenter.error(msg);
        process.exit(1);
    }
}

main(process.argv.slice(2));