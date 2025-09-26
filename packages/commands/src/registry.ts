import type { Command, CommandRegistry } from "./types";

class InMemoryRegistry implements CommandRegistry {
  private byName = new Map<string, Command>();

  register(cmd: Command): void {
    this.byName.set(cmd.name, cmd);
    for (const a of cmd.aliases || []) {
      this.byName.set(a, cmd);
    }
  }
  has(name: string): boolean {
    return this.byName.has(name);
  }
  get(nameOrPath: string | string[]): Command | undefined {
    const key = Array.isArray(nameOrPath) ? nameOrPath.join(".") : nameOrPath;
    // поддержка составных имён вида "init.profile"
    if (this.byName.has(key)) {
      return this.byName.get(key);
    }
    // поддержка пути ["init","profile"] => пробуем "init.profile"
    if (Array.isArray(nameOrPath)) {
      const dot = nameOrPath.join(".");
      return this.byName.get(dot);
    }
    return undefined;
  }
  list(): Command[] {
    // вернуть уникальные команды (без дублей по alias)
    return Array.from(new Set(this.byName.values()));
  }
}

export const registry = new InMemoryRegistry();

export function findCommand(nameOrPath: string | string[]) {
  return registry.get(nameOrPath);
}
