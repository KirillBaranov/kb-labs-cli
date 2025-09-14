import type { CliCommand } from "./command";
import { versionCommand } from "../commands/version/index.js";
import { diagnoseCommand } from "../commands/diagnose/index.js";
import { initProfileCommand } from "../commands/init-profile/index.js";

/** Статический реестр. Позже можно добавить динамическое чтение из package.json */
export const registry: CliCommand[] = [
    versionCommand,
    diagnoseCommand,
    initProfileCommand,
];

export function findCommand(path: string[]): CliCommand | undefined {
    const dotted = path.join("."); // "init.profile"
    return registry.find(c => c.name === dotted || c.name.split(" ")[0] === path[0]);
}