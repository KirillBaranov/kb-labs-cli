import {
  colors,
  collectManifestVersions,
  box,
  formatTiming,
  TimingTracker,
  type Command,
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
}): string {
  const tracker = new TimingTracker();
  const products = registry.listProductGroups();
  const standalone = registry
    .list()
    .filter((cmd: Command) => !cmd.category || cmd.category === "system");

  const content: string[] = [];

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
      const badge =
        availableCount > 0
          ? colors.green(`✓ ${availableCount}`)
          : colors.dim("0");
      const manifestVersions = collectManifestVersions(product.commands);
      const manifestInfo =
        manifestVersions.length > 0
          ? colors.yellow(`[manifest ${manifestVersions.join(" + ")}]`)
          : "";
      const describeInfo =
        product.describe && product.describe !== product.name
          ? colors.dim(product.describe)
          : "";
      const detailParts = [describeInfo, manifestInfo, badge].filter(Boolean);
      content.push(
        `  ${colors.cyan(
          product.name.padEnd(maxProductNameLength),
        )}  ${detailParts.join("  ")}`,
      );
    }
    content.push("");
  }

  if (standalone.length > 0) {
    content.push("System Commands:");
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

  content.push("Next Steps:");
  content.push("");

  const firstProduct = products[0];
  if (firstProduct) {
    content.push(
      `  ${colors.cyan(
        `kb ${firstProduct.name} --help`,
      )}  ${colors.dim(`Explore ${firstProduct.name} commands`)}`,
    );
  }

  const versionCmd = standalone.find((c) => c.name === "version");
  if (versionCmd) {
    content.push(
      `  ${colors.cyan("kb version")}  ${colors.dim("Check CLI version")}`,
    );
  }

  const healthCmd = standalone.find((c) => c.name === "health");
  if (healthCmd) {
    content.push(
      `  ${colors.cyan("kb health")}  ${colors.dim("System health snapshot")}`,
    );
  }

  const diagnoseCmd = standalone.find((c) => c.name === "diagnose");
  if (diagnoseCmd) {
    content.push(
      `  ${colors.cyan("kb diagnose")}  ${colors.dim("Diagnose project health")}`,
    );
  }

  content.push("");
  content.push(
    colors.dim("Use 'kb <product> --help' to see commands for a specific product."),
  );

  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);

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

