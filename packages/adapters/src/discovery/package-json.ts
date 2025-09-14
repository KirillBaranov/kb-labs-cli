import { promises as fsp } from "node:fs";
import path from "node:path";
import type { PluginDiscovery } from "@kb-labs/cli-core";
import type { CliCommand } from "@kb-labs/cli-core/command";

/** Look up nearest package.json and read kbLabs.commands list. */
export function createPackageJsonDiscovery(startDir = process.cwd()): PluginDiscovery {
    return {
        async find() {
            const pkgPath = await findNearestPackageJson(startDir);
            if (!pkgPath) return [];
            const raw = await fsp.readFile(pkgPath, "utf8");
            const pkg = JSON.parse(raw) as any;
            const list: string[] = pkg?.kbLabs?.commands ?? [];
            return Array.isArray(list) ? list : [];
        },
        async load(name: string) {
            const mod = await import(name);
            const cmds: CliCommand[] = mod.commands || mod.default || [];
            return Array.isArray(cmds) ? cmds : [];
        }
    };
}

async function findNearestPackageJson(dir: string): Promise<string | null> {
    let cur = path.resolve(dir);
    while (true) {
        const cand = path.join(cur, "package.json");
        try {
            await fsp.access(cand);
            return cand;
        } catch {}
        const parent = path.dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}