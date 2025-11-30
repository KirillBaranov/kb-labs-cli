/**
 * @module @kb-labs/cli-contracts/command/legacy
 * Legacy command interface contracts for backward compatibility
 *
 * These types are shared between cli-commands and shared-command-kit
 * to break circular dependencies.
 */

export type CommandRun = (
  ctx: any,
  argv: string[],
  flags: Record<string, any>,
) => Promise<number | void | unknown> | number | void | unknown;

export interface FlagDefinition {
  name: string;                    // "dry-run", "mode", "json"
  type: "boolean" | "string" | "number" | "array";
  alias?: string;                  // короткий алиас: "d"
  description?: string;
  default?: unknown;
  required?: boolean;
  choices?: string[];              // для enum-флагов
}

export interface Command {
  name: string;                    // короткое имя в группе: "plan"
  describe: string;                // краткое описание
  longDescription?: string;        // детальное описание для help
  category?: string;               // "devlink" | "profiles" | "system"
  aliases?: string[];              // ["devlink:plan"] для обратной совместимости
  flags?: FlagDefinition[];        // метаданные флагов (для будущего)
  examples?: string[];             // примеры использования
  run: CommandRun;
}

export interface CommandGroup {
  name: string;                    // "devlink"
  aliases?: string[];              // ["wf"] для алиасов группы
  describe: string;                // "Workspace linking and dependency management"
  commands: Command[];
}

export interface CommandLookup {
  get(nameOrPath: string | string[]): Command | CommandGroup | undefined;
  list(): Command[];
}

export interface CommandRegistry extends CommandLookup {
  register(cmd: Command): void;
  registerGroup(group: CommandGroup): void;
  has(name: string): boolean;
  listGroups(): CommandGroup[];

  // New: System groups support
  getGroupsByPrefix?: (prefix: string) => CommandGroup[];
  getCommandsByGroupPrefix?: (prefix: string) => Command[];

  // New: Manifest support
  registerManifest?: (cmd: any) => void; // any to avoid circular dependency with registry types
  getManifest?: (id: string) => any;
  listManifests?: () => any[];
}
