import type { CliCommand } from "../../core/command";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@kb-labs/core-sys/repo";
import { DEFAULT_PROFILE } from "@kb-labs/shared/profiles";

export const initProfileCommand: CliCommand = {
    name: "init.profile",
    description: "Scaffold a profile file in the repo",
    registerFlags(b) { b({ id: "default", dir: "profiles" }); },
    async run(ctx, _argv, flags) {
        const id = (flags.id as string) || "default";
        const dir = (flags.dir as string) || "profiles";
        const repoRoot = findRepoRoot();
        const targetDir = path.join(repoRoot, dir, id);
        const file = path.join(targetDir, "profile.json");

        await fsp.mkdir(targetDir, { recursive: true });
        const data = { ...DEFAULT_PROFILE, id };
        await fsp.writeFile(file, JSON.stringify(data, null, 2), "utf8");

        if (ctx.presenter.isTTY) {
            ctx.presenter.success(`Profile scaffolded at ${path.relative(repoRoot, file)}`);
        } else {
            ctx.presenter.json({ ok: true, file });
        }
        return 0;
    }
};