import type { CliCommand } from "../../core/command";

export const versionCommand: CliCommand = {
    name: "version",
    description: "Show CLI and package versions",
    async run(ctx) {
        const versions = [
            { pkg: "@kb-labs/cli", version: process.env.npm_package_version || "dev" },
            // при желании — подтяни версии зависимостей из require.resolve/package.json
        ];
        if (ctx.presenter.isTTY) {
            ctx.presenter.section("KB Labs Versions");
            ctx.presenter.table(versions);
        } else {
            ctx.presenter.json({ ok: true, versions });
        }
        return 0;
    }
};