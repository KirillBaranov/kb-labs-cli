import type { Command, CommandGroup, CommandRegistry } from "../types";
import type { RegisteredCommand } from "./types.js";
import type { ManifestV2, CliCommandDecl } from "@kb-labs/plugin-manifest";
import { getContextCwd } from "@kb-labs/shared-cli-ui";

function manifestToCommand(registered: RegisteredCommand): Command {
  const name = registered.manifest.id.includes(":")
    ? registered.manifest.id.replace(":", " ")
    : registered.manifest.id;

  async function executeLoaderCommand(
    ctx: any,
    argv: string[],
    flags: Record<string, unknown>,
  ): Promise<number> {
    const loader = registered.manifest.loader;
    if (typeof loader !== "function") {
      ctx.presenter.error(
        `Command ${registered.manifest.id} is missing runtime loader.`,
      );
      return 1;
    }

    let module: { run?: Command["run"] };
    try {
      module = await loader();
    } catch (error: any) {
      ctx.presenter.error(
        `Failed to load ${registered.manifest.id}: ${error?.message || error}`,
      );
      return 1;
    }

    if (!module || typeof module.run !== "function") {
      ctx.presenter.error(
        `Command ${registered.manifest.id} loader did not return a runnable command.`,
      );
      return 1;
    }

    const result = await module.run(ctx, argv, flags);
    return typeof result === "number" ? result : 0;
  }

  return {
    name,
    category: registered.manifest.group,
    describe: registered.manifest.describe,
    longDescription: registered.manifest.longDescription,
    aliases: registered.manifest.aliases || [],
    flags: registered.manifest.flags,
    examples: registered.manifest.examples,
    async run(ctx, argv, flags, actualRest?: string[]) {
      const isSetupCommand =
        (registered.manifest as any).isSetup === true ||
        (registered.manifest as any).isSetupRollback === true;

      if (isSetupCommand) {
        return executeLoaderCommand(ctx, argv, flags);
      }

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
        ctx.presenter.warn(
          `${registered.manifest.id} unavailable: ${registered.unavailableReason}`,
        );
        if (registered.hint) {
          ctx.presenter.info(registered.hint);
        }
        return 2;
      }

      const manifestV2 = registered.manifest.manifestV2;
      if (!manifestV2) {
        ctx.presenter.error(
          `Command ${registered.manifest.id} must have ManifestV2 manifest. This command cannot be executed without proper manifest declaration.`,
        );
        return 1;
      }

      if (!manifestV2.permissions) {
        ctx.presenter.error(
          `Command ${registered.manifest.id} must declare permissions in manifest. Add 'permissions: { fs: {...}, net: {...}, env: {...} }' to manifest.`,
        );
        return 1;
      }

      const commandId =
        registered.manifest.id.split(":").pop() || registered.manifest.id;
      const cliCommand = manifestV2.cli?.commands?.find(
        (c: CliCommandDecl) =>
          c.id === commandId || c.id === registered.manifest.id,
      );

      if (!cliCommand || !cliCommand.handler) {
        ctx.presenter.error(
          `Command ${registered.manifest.id} has no handler in manifest. Add 'handler: "./cli/command#run"' to CLI command declaration.`,
        );
        return 1;
      }

      try {
        const currentCwd = getContextCwd(ctx);
        const { executeCommand } = await import("@kb-labs/plugin-adapter-cli");

        let exitCode: number;
        try {
          // Pass argv (actualRest) to executeCommand via context
          // actualRest contains subcommand and remaining args
          const commandArgv = actualRest ?? argv;
          // Store argv in context so executeCommand can access it
          (ctx as any).argv = commandArgv;
          exitCode = await executeCommand(
            cliCommand,
            manifestV2 as ManifestV2,
            ctx,
            flags,
            manifestV2.capabilities || [],
            registered.pkgRoot,
            currentCwd,
            undefined,
            undefined,
          );
        } catch (syncError: any) {
          if (flags.debug) {
            ctx.presenter.error(
              `[debug] Synchronous error in executeCommand: ${syncError.message}`,
            );
            ctx.presenter.error(`[debug] Stack: ${syncError.stack}`);
          }
          throw syncError;
        }
        return exitCode;
      } catch (error: any) {
        if (flags.debug) {
          ctx.presenter.error(
            `[debug] Error in executeCommand: ${error.message}`,
          );
          ctx.presenter.error(`[debug] Stack: ${error.stack}`);
        }
        ctx.presenter.error(
          `Failed to execute ${registered.manifest.id}: ${error.message}`,
        );
        return 1;
      }
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
  private manifests = new Map<string, RegisteredCommand>();
  private partial = false;

  register(cmd: Command): void {
    this.byName.set(cmd.name, cmd);
    for (const a of cmd.aliases || []) {
      this.byName.set(a, cmd);
    }
  }

  registerGroup(group: CommandGroup): void {
    this.groups.set(group.name, group);
    this.byName.set(group.name, group);

    for (const cmd of group.commands) {
      const fullName = `${group.name} ${cmd.name}`;
      this.byName.set(fullName, cmd);

      for (const alias of cmd.aliases || []) {
        this.byName.set(alias, cmd);
      }
    }
  }

  registerManifest(cmd: RegisteredCommand): void {
    this.manifests.set(cmd.manifest.id, cmd);

    const commandAdapter = manifestToCommand(cmd);

    this.byName.set(cmd.manifest.id, commandAdapter);
    this.byName.set(commandAdapter.name, commandAdapter);

    if (cmd.manifest.aliases) {
      for (const alias of cmd.manifest.aliases) {
        this.byName.set(alias, commandAdapter);
      }
    }
  }

  markPartial(partial: boolean): void {
    this.partial = partial;
  }

  isPartial(): boolean {
    return this.partial;
  }

  getManifest(id: string): RegisteredCommand | undefined {
    return this.manifests.get(id);
  }

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
    if (typeof nameOrPath === "string") {
      if (this.byName.has(nameOrPath)) {
        return this.byName.get(nameOrPath);
      }
      if (nameOrPath.includes(":")) {
        const parts = nameOrPath.split(":");
        if (parts.length === 2) {
          const exactMatch = this.byName.get(nameOrPath);
          if (exactMatch) {
            return exactMatch;
          }

          const spaceKey = parts.join(" ");
          if (this.byName.has(spaceKey)) {
            return this.byName.get(spaceKey);
          }
        }
      }
    }

    const key = Array.isArray(nameOrPath)
      ? nameOrPath.join(" ")
      : nameOrPath;

    if (this.byName.has(key)) {
      return this.byName.get(key);
    }

    if (
      Array.isArray(nameOrPath) &&
      nameOrPath.length === 1 &&
      nameOrPath[0]?.includes(":")
    ) {
      if (this.byName.has(nameOrPath[0])) {
        return this.byName.get(nameOrPath[0]);
      }

      const [group, command] = nameOrPath[0].split(":");
      const legacyKey = `${group} ${command}`;
      if (this.byName.has(legacyKey)) {
        return this.byName.get(legacyKey);
      }
    }

    if (Array.isArray(nameOrPath)) {
      const dot = nameOrPath.join(".");
      if (this.byName.has(dot)) {
        return this.byName.get(dot);
      }
    }

    return undefined;
  }

  list(): Command[] {
    const commands = new Set<Command>();
    for (const value of this.byName.values()) {
      if ("run" in value) {
        commands.add(value);
      }
    }
    return Array.from(commands);
  }

  listGroups(): CommandGroup[] {
    return Array.from(this.groups.values());
  }

  listProductGroups(): ProductGroup[] {
    const groups = new Map<string, ProductGroup>();

    for (const cmd of this.listManifests()) {
      const groupName = cmd.manifest.group;
      if (!groups.has(groupName)) {
        groups.set(groupName, {
          name: groupName,
          describe: cmd.manifest.group,
          commands: [],
        });
      }
      groups.get(groupName)!.commands.push(cmd);
    }

    return Array.from(groups.values());
  }

  getCommandsByGroup(group: string): RegisteredCommand[] {
    return this.listManifests()
      .filter((cmd) => cmd.manifest.group === group)
      .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }

  getManifestCommand(idOrAlias: string): RegisteredCommand | undefined {
    if (this.manifests.has(idOrAlias)) {
      return this.manifests.get(idOrAlias);
    }

    for (const cmd of this.manifests.values()) {
      if (cmd.manifest.aliases?.includes(idOrAlias)) {
        return cmd;
      }
      if (cmd.manifest.id.replace(":", " ") === idOrAlias) {
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

