import type { Command, CommandGroup, CommandRegistry } from "../types";
import type { RegisteredCommand } from "../registry/types.js";

/**
 * Convert RegisteredCommand to Command-like object for compatibility
 */
function manifestToCommand(registered: RegisteredCommand): Command {
  // For manifest-based commands, use the full ID as the name
  // This allows commands like "devlink:plan" to be found as "devlink plan"
  const name = registered.manifest.id.includes(':') 
    ? registered.manifest.id.replace(':', ' ')
    : registered.manifest.id;
    
  return {
    name,
    category: registered.manifest.group,
    describe: registered.manifest.describe,
    longDescription: registered.manifest.longDescription,
    aliases: registered.manifest.aliases || [],
    flags: registered.manifest.flags,
    examples: registered.manifest.examples,
    async run(ctx, argv, flags) {
      // Lazy load and execute
      if (!registered.available) {
        if (flags.json) {
          ctx.presenter.json({
            ok: false,
            available: false,
            command: registered.manifest.id,
            reason: registered.unavailableReason,
            hint: registered.hint,
          });
          return 2;
        }
        ctx.presenter.warn(`${registered.manifest.id} unavailable: ${registered.unavailableReason}`);
        if (registered.hint) {ctx.presenter.info(registered.hint);}
        return 2;
      }
      
      const mod = await registered.manifest.loader();
      if (!mod?.run) {
        ctx.presenter.error(`Invalid command module for ${registered.manifest.id}`);
        return 1;
      }
      
      const result = await mod.run(ctx, argv, flags);
      return typeof result === 'number' ? result : 0;
    },
  };
}

export interface ProductGroup {
  name: string;
  describe?: string;
  commands: RegisteredCommand[];
}

class InMemoryRegistry implements CommandRegistry {
  private byName = new Map<string, Command | CommandGroup>();
  private groups = new Map<string, CommandGroup>();
  private manifests = new Map<string, RegisteredCommand>(); // New: manifest storage

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

  // New: Register manifest-based command
  registerManifest(cmd: RegisteredCommand): void {
    // Only store in manifests map once, by ID only (not by aliases)
    this.manifests.set(cmd.manifest.id, cmd);
    
    // Register as Command for compatibility
    const commandAdapter = manifestToCommand(cmd);
    
    // Register with both original ID and converted name for compatibility
    this.byName.set(cmd.manifest.id, commandAdapter);
    this.byName.set(commandAdapter.name, commandAdapter);
    
    // Register aliases in byName only (not in manifests)
    if (cmd.manifest.aliases) {
      for (const alias of cmd.manifest.aliases) {
        this.byName.set(alias, commandAdapter);
      }
    }
  }

  // New: Get manifest by ID
  getManifest(id: string): RegisteredCommand | undefined {
    return this.manifests.get(id);
  }

  // New: List all registered manifests
  listManifests(): RegisteredCommand[] {
    const unique = new Set<RegisteredCommand>();
    for (const cmd of this.manifests.values()) {
      unique.add(cmd);
    }
    return Array.from(unique);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(nameOrPath: string | string[]): Command | CommandGroup | undefined {
    // First try exact match if single string
    if (typeof nameOrPath === 'string') {
      if (this.byName.has(nameOrPath)) {
        return this.byName.get(nameOrPath);
      }
      // Try as array for commands like "plugins:doctor"
      if (nameOrPath.includes(":")) {
        const parts = nameOrPath.split(":");
        if (parts.length === 2) {
          // Try exact match first, then split format
          const exactMatch = this.byName.get(nameOrPath);
          if (exactMatch) {return exactMatch;}
          
          // Try space-separated format
          const spaceKey = parts.join(" ");
          if (this.byName.has(spaceKey)) {
            return this.byName.get(spaceKey);
          }
        }
      }
    }
    
    // Array format
    const key = Array.isArray(nameOrPath) ? nameOrPath.join(" ") : nameOrPath;

    // Прямой поиск по ключу (includes manifest-based commands)
    if (this.byName.has(key)) {
      return this.byName.get(key);
    }

    // Поддержка legacy формата "devlink:plan" -> "devlink plan"
    if (Array.isArray(nameOrPath) && nameOrPath.length === 1 && nameOrPath[0]?.includes(":")) {
      // Try with : separator first (manifest format)
      if (this.byName.has(nameOrPath[0])) {
        return this.byName.get(nameOrPath[0]);
      }
      
      // Then try converting to space-separated (legacy format)
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

  // New: List product groups from manifests
  listProductGroups(): ProductGroup[] {
    const groups = new Map<string, ProductGroup>();
    
    // Use listManifests() to avoid duplicates
    for (const cmd of this.listManifests()) {
      const groupName = cmd.manifest.group;
      if (!groups.has(groupName)) {
        groups.set(groupName, {
          name: groupName,
          describe: cmd.manifest.group, // Could be enhanced with group descriptions
          commands: [],
        });
      }
      groups.get(groupName)!.commands.push(cmd);
    }
    
    return Array.from(groups.values());
  }

  // New: Get commands for a specific group
  getCommandsByGroup(group: string): RegisteredCommand[] {
    // Use listManifests() to avoid duplicates
    return this.listManifests()
      .filter(cmd => cmd.manifest.group === group)
      .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }
  
  // New: Get manifest command by ID or alias
  getManifestCommand(idOrAlias: string): RegisteredCommand | undefined {
    // Try direct ID lookup
    if (this.manifests.has(idOrAlias)) {
      return this.manifests.get(idOrAlias);
    }
    
    // Try alias lookup
    for (const cmd of this.manifests.values()) {
      if (cmd.manifest.aliases?.includes(idOrAlias)) {
        return cmd;
      }
      // Also check whitespace alias
      if (cmd.manifest.id.replace(':', ' ') === idOrAlias) {
        return cmd;
      }
    }
    
    return undefined;
  }
}

export const registry = new InMemoryRegistry();

export function findCommand(nameOrPath: string | string[]) {
  return registry.get(nameOrPath);
}
