import type { CliCommand } from "./command";

/** Статический реестр. Позже можно добавить динамическое чтение из package.json */
export const registry: CliCommand[] = [];

export function findCommand(path: string[]): CliCommand | undefined {
  const dotted = path.join("."); // "init.profile"
  return registry.find(
    (c) => c.name === dotted || c.name.split(" ")[0] === path[0],
  );
}

// Add register method for compatibility
(registry as any).register = function register(command: CliCommand): void {
  registry.push(command);
};
