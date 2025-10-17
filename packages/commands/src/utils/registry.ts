import type { Command, CommandGroup, CommandRegistry } from "../types";

class InMemoryRegistry implements CommandRegistry {
  private byName = new Map<string, Command | CommandGroup>();
  private groups = new Map<string, CommandGroup>();

  register(cmd: Command): void {
    this.byName.set(cmd.name, cmd);
    for (const a of cmd.aliases || []) {
      this.byName.set(a, cmd);
    }
  }

  registerGroup(group: CommandGroup): void {
    this.groups.set(group.name, group);
    this.byName.set(group.name, group);

    // Регистрируем каждую команду с полным именем и алиасами
    for (const cmd of group.commands) {
      const fullName = `${group.name} ${cmd.name}`;
      this.byName.set(fullName, cmd);

      // Алиасы для обратной совместимости
      for (const alias of cmd.aliases || []) {
        this.byName.set(alias, cmd);
      }
    }
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(nameOrPath: string | string[]): Command | CommandGroup | undefined {
    const key = Array.isArray(nameOrPath) ? nameOrPath.join(" ") : nameOrPath;

    // Прямой поиск по ключу
    if (this.byName.has(key)) {
      return this.byName.get(key);
    }

    // Поддержка legacy формата "devlink:plan" -> "devlink plan"
    if (Array.isArray(nameOrPath) && nameOrPath.length === 1 && nameOrPath[0]?.includes(":")) {
      const [group, command] = nameOrPath[0].split(":");
      const legacyKey = `${group} ${command}`;
      if (this.byName.has(legacyKey)) {
        return this.byName.get(legacyKey);
      }
    }

    // Поддержка составных имён вида "init.profile" (legacy)
    if (Array.isArray(nameOrPath)) {
      const dot = nameOrPath.join(".");
      if (this.byName.has(dot)) {
        return this.byName.get(dot);
      }
    }

    return undefined;
  }

  list(): Command[] {
    // вернуть уникальные команды (без дублей по alias)
    const commands = new Set<Command>();
    for (const value of this.byName.values()) {
      if ('run' in value) { // это Command, а не CommandGroup
        commands.add(value);
      }
    }
    return Array.from(commands);
  }

  listGroups(): CommandGroup[] {
    return Array.from(this.groups.values());
  }
}

export const registry = new InMemoryRegistry();

export function findCommand(nameOrPath: string | string[]) {
  return registry.get(nameOrPath);
}
