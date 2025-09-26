export type CommandRun = (
  ctx: any,
  argv: string[],
  flags: Record<string, any>,
) => Promise<number | void> | number | void;

export interface Command {
  name: string; // 'hello' | 'init.profile' | 'diagnose'
  describe?: string;
  aliases?: string[];
  run: CommandRun;
}

export interface CommandLookup {
  get(nameOrPath: string | string[]): Command | undefined;
  list(): Command[];
}

export interface CommandRegistry extends CommandLookup {
  register(cmd: Command): void;
  has(name: string): boolean;
}
