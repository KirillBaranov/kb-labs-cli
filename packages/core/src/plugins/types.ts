import type { CliCommand } from "../command.js";

/** How the CLI discovers/loads command plugins. */
export interface PluginDiscovery {
    /** Return package specifiers (e.g. "@kb-labs/ai-review/cli-plugin") */
    find(): Promise<string[]>;
    /** Load a plugin package and return its commands. */
    load(pkgName: string): Promise<CliCommand[]>;
}