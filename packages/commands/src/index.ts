import { parseArgs } from "./core/flags.js";
import { findCommand } from "./core/registry.js";
import { CliError } from "./core/errors.js";
import { createTextPresenter } from "./core/presenter/text.js";
import { createJsonPresenter } from "./core/presenter/json.js";
import { configureLogger, getLogger, stdoutSink, jsonSink } from "@kb-labs/core-sys/logging";
import { findRepoRoot } from "@kb-labs/core-sys/repo";

async function main(raw: string[]) {
    const { cmdPath, rest, global, flagsObj } = parseArgs(raw);

    // logger (core-sys)
    configureLogger({
        level: (global.logLevel as any) || "info",
        sinks: global.json ? [jsonSink] : [stdoutSink]
    });
    const logger = getLogger("cli");

    // presenter
    const presenter = global.json ? createJsonPresenter() : createTextPresenter();

    // route command
    const cmd = findCommand(cmdPath);
    if (!cmd) {
        if (global.json) presenter.json({ ok: false, error: { code: "CMD_NOT_FOUND", message: `Unknown command: ${cmdPath.join(" ") || "(none)"}` } });
        else presenter.error(`Unknown command: ${cmdPath.join(" ") || "(none)"}`);
        process.exitCode = 1;
        return;
    }

    const ctx = {
        repoRoot: findRepoRoot(),
        logger,
        presenter,
        env: process.env
    };

    try {
        const code = await cmd.run(ctx, rest, { ...global, ...flagsObj });
        if (typeof code === "number") process.exitCode = code;
    } catch (e: any) {
        const msg = e instanceof CliError ? `${e.code}: ${e.message}` : String(e?.message || e);
        if (global.json) presenter.json({ ok: false, error: { message: msg } });
        else presenter.error(msg);
        process.exitCode = 1;
    }
}

main(process.argv.slice(2));