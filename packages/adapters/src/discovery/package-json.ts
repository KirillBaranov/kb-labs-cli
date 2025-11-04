import { promises as fsp } from "node:fs";
import path from "node:path";
import type { PluginDiscovery } from "@kb-labs/cli-core";
import type { CliCommand } from "@kb-labs/cli-core";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

/** Look up nearest package.json and read kb.commands list. */
export function createPackageJsonDiscovery(
  startDir = process.cwd(),
): PluginDiscovery {
  return {
    async find() {
      const pkgPath = await findNearestPackageJson(startDir);
      if (!pkgPath) {
        return [];
      }
      try {
        const raw = await fsp.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(raw) as any;
        const list: string[] = pkg?.kb?.commands ?? [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        throw new CliError(
          CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
          `Failed to read package.json at ${pkgPath}`,
          e,
        );
      }
    },
    async load(name: string) {
      try {
        const mod = await import(name);
        const cmds: CliCommand[] = mod.commands || mod.default || [];
        return Array.isArray(cmds) ? cmds : [];
      } catch (e) {
        throw new CliError(
          CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
          `Failed to load plugin ${name}`,
          e,
        );
      }
    },
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
    if (parent === cur) {
      return null;
    }
    cur = parent;
  }
}
