import {
  colors,
  box,
  formatTiming,
  TimingTracker,
  type Command,
  type CommandGroup,
  type ProductGroup,
} from "./shared";

export function renderGlobalHelp(
  groups: ProductGroup[],
  standalone: Command[],
): string {
  const lines: string[] = [];

  lines.push(
    colors.cyan(colors.bold("KB Labs CLI")) +
      " - Project management and automation tool",
  );
  lines.push("");
  lines.push(colors.bold("Usage:") + " kb [command] [options]");
  lines.push("");

  if (groups.length > 0) {
    lines.push(colors.bold("Product Commands:"));
    lines.push("");

    for (const group of groups.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(
        `  ${colors.cyan(group.name.padEnd(12))}  ${colors.dim(
          group.describe ?? "",
        )}`,
      );
    }
    lines.push("");
  }

  if (standalone.length > 0) {
    lines.push(colors.bold("System Commands:"));
    lines.push("");

    for (const cmd of standalone.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(
        `  ${colors.cyan(cmd.name.padEnd(12))}  ${colors.dim(cmd.describe)}`,
      );
    }
    lines.push("");
  }

  lines.push(colors.bold("Global Options:"));
  lines.push("");
  lines.push(
    `  ${colors.cyan("--help".padEnd(12))}  ${colors.dim("Show help information")}`,
  );
  lines.push(
    `  ${colors.cyan("--version".padEnd(12))}  ${colors.dim("Show CLI version")}`,
  );
  lines.push(
    `  ${colors.cyan("--json".padEnd(12))}  ${colors.dim("Output in JSON format")}`,
  );
  lines.push(
    `  ${colors.cyan("--quiet".padEnd(12))}  ${colors.dim("Suppress detailed output")}`,
  );
  lines.push("");
  lines.push(
    colors.dim(
      "Use 'kb <group> --help' to see commands for a specific product.",
    ),
  );

  return lines.join("\n");
}

export function renderGlobalHelpNew(registry: {
  listProductGroups(): ProductGroup[];
  list(): Command[];
  listGroups?(): CommandGroup[];
}): string {
  const products = registry.listProductGroups();
  const systemGroups = registry.listGroups?.() || [];
  
  // Get all command names and aliases from groups to exclude them from standalone
  const commandsInGroups = new Set<string>();
  for (const group of systemGroups) {
    for (const cmd of group.commands) {
      commandsInGroups.add(cmd.name);
      // Also add all aliases
      for (const alias of cmd.aliases || []) {
        commandsInGroups.add(alias);
      }
    }
  }
  
  // Filter standalone commands - exclude commands that are already in groups
  const standalone = registry
    .list()
    .filter((cmd: Command) => {
      // Exclude commands that are in groups
      if (commandsInGroups.has(cmd.name)) {
        return false;
      }
      // Keep only system commands without category or with category === "system"
      return (!cmd.category || cmd.category === "system");
    });

  const content: string[] = [];

  // Products section - simplified format: name (count)
  if (products.length > 0) {
    content.push("Products:");
    content.push("");

    const maxProductNameLength = Math.max(
      ...products.map((p) => p.name.length),
      12,
    );

    for (const product of products.sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const availableCount = product.commands.filter(
        (c) => c.available && !c.shadowed,
      ).length;
      const badge = colors.green(`(${availableCount})`);
      
      content.push(
        `  ${colors.cyan(
          product.name.padEnd(maxProductNameLength),
        )}  ${badge}`,
      );
    }
    content.push("");
  }

  // System Commands section - compact format: group name (count)
  if (systemGroups.length > 0) {
    content.push("System Commands:");
    content.push("");

    const maxGroupNameLength = Math.max(
      ...systemGroups.map((g) => g.name.length),
      20,
    );

    for (const group of systemGroups.sort((a, b) => a.name.localeCompare(b.name))) {
      const commandCount = group.commands.length;
      const badge = colors.green(`(${commandCount})`);
      
      content.push(
        `  ${colors.cyan(group.name.padEnd(maxGroupNameLength))}  ${badge}`,
      );
    }
    content.push("");
  }

  // Other Commands section - only show if there are standalone commands
  if (standalone.length > 0) {
    content.push("Other Commands:");
    content.push("");

    const maxCommandNameLength = Math.max(
      ...standalone.map((c) => c.name.length),
      12,
    );

    for (const cmd of standalone.sort((a, b) => a.name.localeCompare(b.name))) {
      content.push(
        `  ${colors.cyan(cmd.name.padEnd(maxCommandNameLength))}  ${colors.dim(
          cmd.describe,
        )}`,
      );
    }
    content.push("");
  }

  // Global Options section
  content.push("Global Options:");
  content.push("");

  const globalOptions = [
    { name: "--help", desc: "Show help information" },
    { name: "--version", desc: "Show CLI version" },
    { name: "--json", desc: "Output in JSON format" },
    { name: "--quiet", desc: "Suppress detailed output" },
  ];

  const maxOptionNameLength = Math.max(
    ...globalOptions.map((o) => o.name.length),
    12,
  );

  for (const option of globalOptions) {
    content.push(
      `  ${colors.cyan(option.name.padEnd(maxOptionNameLength))}  ${colors.dim(
        option.desc,
      )}`,
    );
  }
  content.push("");

  // Next Steps section - simplified to 2-3 most important examples
  content.push("Next Steps:");
  content.push("");

  const firstProduct = products[0];
  if (firstProduct) {
    content.push(
      `  ${colors.cyan(
        `kb ${firstProduct.name} --help`,
      )}  ${colors.dim("Explore product commands")}`,
    );
  }

  const pluginsGroup = systemGroups.find((g: CommandGroup) => g.name === "system:plugins");
  if (pluginsGroup) {
    content.push(
      `  ${colors.cyan("kb plugins")}  ${colors.dim("List and manage plugins")}`,
    );
  }

  content.push("");
  content.push(
    colors.dim("Use 'kb <product> --help' or 'kb <group> --help' to see commands for a specific product or group."),
  );

  return box("KB Labs CLI", content);
}

export function renderPluginsHelp(registry: {
  list(): Command[];
}): string {
  const tracker = new TimingTracker();

  const pluginCommands = registry
    .list()
    .filter(
      (cmd) =>
        cmd.name?.startsWith("plugins:") || cmd.category === "system",
    );

  const content: string[] = [];

  content.push(colors.bold("Plugin Management Commands:"));
  content.push("");

  const commandMap: Record<string, string> = {
    "plugins:ls": "List all discovered plugins",
    "plugins:enable": "Enable a plugin",
    "plugins:disable": "Disable a plugin",
    "plugins:link": "Link a local plugin for development",
    "plugins:unlink": "Unlink a local plugin",
    "plugins:doctor": "Diagnose plugin issues",
    "plugins:watch": "Watch for manifest changes and hot-reload",
    "plugins:scaffold": "Generate a new plugin template",
    "plugins:clear-cache": "Clear plugin discovery cache",
  };

  const maxLength = Math.max(
    ...Object.keys(commandMap).map((c) => c.length),
    20,
  );

  for (const [cmdName, desc] of Object.entries(commandMap)) {
    content.push(
      `  ${colors.cyan(cmdName.padEnd(maxLength))}  ${colors.dim(desc)}`,
    );
  }

  content.push("");
  content.push(colors.bold("Examples:"));
  content.push("");
  content.push(
    `  ${colors.dim("kb plugins ls")}                      ${colors.dim("List all plugins")}`,
  );
  content.push(
    `  ${colors.dim("kb plugins enable @kb-labs/devlink-cli")}  ${colors.dim(
      "Enable a plugin",
    )}`,
  );
  content.push(
    `  ${colors.dim("kb plugins doctor")}                 ${colors.dim("Diagnose plugin issues")}`,
  );
  content.push(
    `  ${colors.dim("kb plugins scaffold my-plugin")}      ${colors.dim(
      "Generate plugin template",
    )}`,
  );

  content.push("");
  content.push(colors.dim("Use 'kb plugins <command> --help' for detailed help"));

  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);

  return box("🧩 Plugin Management", content);
}

