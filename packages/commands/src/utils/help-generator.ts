import type { Command, CommandGroup } from "../types";
import type { RegisteredCommand } from "../registry/types.js";
import type { ProductGroup } from "./registry.js";
import { colors } from "@kb-labs/cli-core";
import { box, formatTiming, TimingTracker } from "@kb-labs/shared-cli-ui";

function collectManifestVersions(commands: RegisteredCommand[]): string[] {
  const versions = new Set<string>();

  for (const cmd of commands) {
    const schema = cmd.manifest.manifestV2?.schema;
    if (typeof schema === "string") {
      const tail = schema.split("/").pop() ?? schema;
      const match = tail.match(/\d+/);
      versions.add(match ? `v${match[0]}` : tail);
    } else {
      versions.add("v2");
    }
  }

  return Array.from(versions).sort();
}

export function renderGroupHelp(group: CommandGroup): string {
  const lines: string[] = [];

  lines.push(colors.cyan(colors.bold(`📦 ${group.name}`)) + " - " + colors.dim(group.describe));
  lines.push("");
  lines.push(colors.bold("Available commands:"));
  lines.push("");

  // Сортируем команды по имени для консистентности
  const sortedCommands = [...group.commands].sort((a, b) => a.name.localeCompare(b.name));

  // Находим максимальную длину имени команды для выравнивания
  const maxNameLength = Math.max(...sortedCommands.map(cmd => cmd.name.length));

  for (const cmd of sortedCommands) {
    const paddedName = cmd.name.padEnd(maxNameLength);
    const description = cmd.describe || "No description";
    lines.push(`  ${colors.cyan(paddedName)}  ${colors.dim(description)}`);

    // Добавляем примеры если есть
    if (cmd.examples && cmd.examples.length > 0) {
      for (const example of cmd.examples.slice(0, 2)) { // Показываем максимум 2 примера
        lines.push(`    ${colors.dim(example)}`);
      }
    }
  }

  lines.push("");
  lines.push(colors.dim(`Use 'kb ${group.name} <command> --help' for more information on a command.`));

  return lines.join("\n");
}

export function renderGlobalHelp(groups: CommandGroup[], standalone: Command[]): string {
  const lines: string[] = [];

  lines.push(colors.cyan(colors.bold("KB Labs CLI")) + " - Project management and automation tool");
  lines.push("");
  lines.push(colors.bold("Usage:") + " kb [command] [options]");
  lines.push("");

  if (groups.length > 0) {
    lines.push(colors.bold("Product Commands:"));
    lines.push("");

    for (const group of groups.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  ${colors.cyan(group.name.padEnd(12))}  ${colors.dim(group.describe)}`);
    }
    lines.push("");
  }

  if (standalone.length > 0) {
    lines.push(colors.bold("System Commands:"));
    lines.push("");

    for (const cmd of standalone.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  ${colors.cyan(cmd.name.padEnd(12))}  ${colors.dim(cmd.describe)}`);
    }
    lines.push("");
  }

  lines.push(colors.bold("Global Options:"));
  lines.push("");
  lines.push(`  ${colors.cyan("--help".padEnd(12))}  ${colors.dim("Show help information")}`);
  lines.push(`  ${colors.cyan("--version".padEnd(12))}  ${colors.dim("Show CLI version")}`);
  lines.push(`  ${colors.cyan("--json".padEnd(12))}  ${colors.dim("Output in JSON format")}`);
  lines.push(`  ${colors.cyan("--quiet".padEnd(12))}  ${colors.dim("Suppress detailed output")}`);
  lines.push("");
  lines.push(colors.dim("Use 'kb <group> --help' to see commands for a specific product."));

  return lines.join("\n");
}

export function renderProductHelp(groupName: string, commands: RegisteredCommand[]): string {
  const tracker = new TimingTracker();
  
  // Build content for box
  const content: string[] = [];
  
  const manifestVersions = collectManifestVersions(commands);
  if (manifestVersions.length > 0) {
    content.push(colors.bold("Manifest:"));
    content.push(`  ${colors.cyan(manifestVersions.join(" + "))}`);
    content.push("");
  }
  
  content.push(colors.bold("Available commands:"));
  content.push("");
  
  // Group by availability and deduplicate by ID
  const availableMap = new Map<string, RegisteredCommand>();
  const unavailableMap = new Map<string, RegisteredCommand>();
  
  for (const cmd of commands) {
    if (cmd.available && !cmd.shadowed) {
      if (!availableMap.has(cmd.manifest.id)) {
        availableMap.set(cmd.manifest.id, cmd);
      }
    } else {
      if (!unavailableMap.has(cmd.manifest.id)) {
        unavailableMap.set(cmd.manifest.id, cmd);
      }
    }
  }
  
  const available = Array.from(availableMap.values()).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  const unavailable = Array.from(unavailableMap.values()).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  
  // Find max length for alignment
  const maxLength = Math.max(...[...available, ...unavailable].map(c => c.manifest.id.length), 20);
  
  // Show available commands
  for (const cmd of available) {
    const status = colors.green("✓");
    const paddedId = cmd.manifest.id.padEnd(maxLength);
    content.push(`  ${status} ${colors.cyan(paddedId)}  ${colors.dim(cmd.manifest.describe)}`);
    
    // Show examples if available
    if (cmd.manifest.examples && cmd.manifest.examples.length > 0) {
      for (const example of cmd.manifest.examples.slice(0, 2) as string[]) {
        content.push(`     ${colors.dim(example)}`);
      }
    }
  }
  
  // Show unavailable commands
  if (unavailable.length > 0) {
    content.push("");
    content.push(colors.dim("Unavailable:"));
    for (const cmd of unavailable) {
      const status = colors.red("✗");
      const paddedId = cmd.manifest.id.padEnd(maxLength);
      content.push(`  ${status} ${colors.dim(paddedId)}  ${colors.dim(cmd.manifest.describe)}`);
      
      if (cmd.unavailableReason) {
        content.push(`     ${colors.red(`Reason: ${cmd.unavailableReason}`)}`);
      }
      if (cmd.hint) {
        content.push(`     ${colors.yellow(`Hint: ${cmd.hint}`)}`);
      }
    }
  }
  
  content.push("");
  content.push(colors.bold("Next Steps:"));
  content.push("");
  
  // Show next steps with actual commands from this group (deduplicate by ID)
  const uniqueCommands = new Map<string, RegisteredCommand>();
  for (const cmd of available) {
    if (!uniqueCommands.has(cmd.manifest.id)) {
      uniqueCommands.set(cmd.manifest.id, cmd);
    }
  }
  
  const nextSteps = Array.from(uniqueCommands.values()).slice(0, 3).map(cmd => {
    return `  ${colors.cyan(`kb ${cmd.manifest.id}`)}  ${colors.dim(cmd.manifest.describe)}`;
  });
  
  if (nextSteps.length === 0) {
    nextSteps.push(`  ${colors.dim("No available commands in this product")}`);
  } else {
    nextSteps.push("");
    nextSteps.push(`  ${colors.dim("Use 'kb ${groupName}:<command> --help' for detailed help")}`);
  }
  
  content.push(...nextSteps);
  content.push("");
  content.push(colors.dim(`Use 'kb --help' to see all products and system commands.`));
  
  // Add timing
  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);
  
  // Return box-formatted help
  return box(groupName, content);
}

export function renderGlobalHelpNew(registry: any): string {
  const tracker = new TimingTracker();
  
  // Get products from manifests
  const products = registry.listProductGroups();
  const standalone = registry.list().filter((cmd: Command) => !cmd.category || cmd.category === 'system');
  
  // Build content for box
  const content: string[] = [];
  
  // Products section
  if (products.length > 0) {
    content.push("Products:");
    content.push("");
    
    // Emoji map for products (unused, kept for backward compatibility)
    const emojiMap: Record<string, string> = {
      'devlink': '🔗',
      'profiles': '📋',
      'mind': '🧠',
      'bundle': '📦',
      'init': '🚀',
    };
    
    // Calculate max product name length for alignment
    const maxProductNameLength = Math.max(...products.map((p: ProductGroup) => p.name.length), 12);
    
    for (const product of products.sort((a: ProductGroup, b: ProductGroup) => a.name.localeCompare(b.name))) {
      const availableCount = product.commands.filter((c: RegisteredCommand) => c.available && !c.shadowed).length;
      const badge = availableCount > 0 ? colors.green(`✓ ${availableCount}`) : colors.dim("0");
      const manifestVersions = collectManifestVersions(product.commands);
      const manifestInfo = manifestVersions.length > 0
        ? colors.yellow(`[manifest ${manifestVersions.join(" + ")}]`)
        : "";
      const describeInfo = product.describe && product.describe !== product.name
        ? colors.dim(product.describe)
        : "";
      const detailParts = [describeInfo, manifestInfo, badge].filter(Boolean);
      content.push(`  ${colors.cyan(product.name.padEnd(maxProductNameLength))}  ${detailParts.join("  ")}`);
    }
    content.push("");
  }
  
  // System commands section
  if (standalone.length > 0) {
    content.push("System Commands:");
    content.push("");
    
    // Calculate max command name length for alignment
    const maxCommandNameLength = Math.max(...standalone.map((c: Command) => c.name.length), 12);
    
    for (const cmd of standalone.sort((a: Command, b: Command) => a.name.localeCompare(b.name))) {
      content.push(`  ${colors.cyan(cmd.name.padEnd(maxCommandNameLength))}  ${colors.dim(cmd.describe)}`);
    }
    content.push("");
  }
  
  // Global options section
  content.push("Global Options:");
  content.push("");
  
  const globalOptions = [
    { name: "--help", desc: "Show help information" },
    { name: "--version", desc: "Show CLI version" },
    { name: "--json", desc: "Output in JSON format" },
    { name: "--quiet", desc: "Suppress detailed output" }
  ];
  
  // Calculate max option name length for alignment
  const maxOptionNameLength = Math.max(...globalOptions.map(o => o.name.length), 12);
  
  for (const option of globalOptions) {
    content.push(`  ${colors.cyan(option.name.padEnd(maxOptionNameLength))}  ${colors.dim(option.desc)}`);
  }
  content.push("");
  
  // Next Steps section
  content.push("Next Steps:");
  content.push("");
  
  // Dynamically generate next steps
  if (products.length > 0) {
    const firstProduct = products[0];
    content.push(`  ${colors.cyan(`kb ${firstProduct.name} --help`)}  ${colors.dim(`Explore ${firstProduct.name} commands`)}`);
  }
  
  // Check if version command exists
  const versionCmd = standalone.find((c: Command) => c.name === 'version');
  if (versionCmd) {
    content.push(`  ${colors.cyan("kb version")}  ${colors.dim("Check CLI version")}`);
  }
  
  // Check if diagnose command exists
  const diagnoseCmd = standalone.find((c: Command) => c.name === 'diagnose');
  if (diagnoseCmd) {
    content.push(`  ${colors.cyan("kb diagnose")}  ${colors.dim("Diagnose project health")}`);
  }
  
  content.push("");
  content.push(colors.dim("Use 'kb <product> --help' to see commands for a specific product."));
  
  // Add timing
  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);
  
  // Return box-formatted help
  return box("KB Labs CLI", content);
}

export function renderPluginsHelp(registry: any): string {
  const tracker = new TimingTracker();
  
  const pluginCommands = registry.list().filter((cmd: Command) => 
    cmd.name?.startsWith('plugins:') || cmd.category === 'system'
  );
  
  const content: string[] = [];
  
  content.push(colors.bold("Plugin Management Commands:"));
  content.push("");
  
  const commandMap: Record<string, string> = {
    'plugins:ls': 'List all discovered plugins',
    'plugins:enable': 'Enable a plugin',
    'plugins:disable': 'Disable a plugin',
    'plugins:link': 'Link a local plugin for development',
    'plugins:unlink': 'Unlink a local plugin',
    'plugins:doctor': 'Diagnose plugin issues',
    'plugins:watch': 'Watch for manifest changes and hot-reload',
    'plugins:scaffold': 'Generate a new plugin template',
    'plugins:clear-cache': 'Clear plugin discovery cache',
  };
  
  const maxLength = Math.max(...Object.keys(commandMap).map(c => c.length), 20);
  
  for (const [cmdName, desc] of Object.entries(commandMap)) {
    content.push(`  ${colors.cyan(cmdName.padEnd(maxLength))}  ${colors.dim(desc)}`);
  }
  
  content.push("");
  content.push(colors.bold("Examples:"));
  content.push("");
  content.push(`  ${colors.dim('kb plugins ls')}                      ${colors.dim('List all plugins')}`);
  content.push(`  ${colors.dim('kb plugins enable @kb-labs/devlink-cli')}  ${colors.dim('Enable a plugin')}`);
  content.push(`  ${colors.dim('kb plugins doctor')}                 ${colors.dim('Diagnose plugin issues')}`);
  content.push(`  ${colors.dim('kb plugins scaffold my-plugin')}      ${colors.dim('Generate plugin template')}`);
  
  content.push("");
  content.push(colors.dim("Use 'kb plugins <command> --help' for detailed help"));
  
  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);
  
  return box("🧩 Plugin Management", content);
}

/**
 * Render help for manifest-based command
 */
export function renderManifestCommandHelp(registered: RegisteredCommand): string {
  const tracker = new TimingTracker();
  const manifest = registered.manifest;
  const fullName = manifest.id;
  
  const content: string[] = [];
  
  if (manifest.describe) {
    content.push(colors.bold("Description:"));
    content.push(`  ${manifest.describe}`);
    content.push("");
  }
  
  if (manifest.longDescription) {
    content.push(colors.bold("Details:"));
    content.push(`  ${manifest.longDescription}`);
    content.push("");
  }
  
  if (manifest.aliases && manifest.aliases.length > 0) {
    content.push(colors.bold("Aliases:"));
    content.push(`  ${manifest.aliases.join(", ")}`);
    content.push("");
  }
  
  if (manifest.examples && manifest.examples.length > 0) {
    content.push(colors.bold("Examples:"));
    for (const example of manifest.examples) {
      content.push(`  ${colors.dim(example)}`);
    }
    content.push("");
  }
  
  if (manifest.flags && manifest.flags.length > 0) {
    content.push(colors.bold("Options:"));
    for (const flag of manifest.flags) {
      const flagName = flag.alias ? `-${flag.alias}, --${flag.name}` : `--${flag.name}`;
      const typeInfo = flag.type !== "boolean" ? ` <${flag.type}>` : "";
      const required = flag.required ? colors.red(" (required)") : "";
      const defaultVal = flag.default !== undefined ? colors.dim(` (default: ${flag.default})`) : "";
      
      content.push(`  ${colors.cyan(flagName + typeInfo)}${required}${defaultVal}`);
      if (flag.description) {
        content.push(`    ${colors.dim(flag.description)}`);
      }
      if (flag.choices && flag.choices.length > 0) {
        content.push(`    ${colors.dim(`Choices: ${flag.choices.join(", ")}`)}`);
      }
    }
    content.push("");
  }
  
  if (manifest.package) {
    content.push(colors.bold("Plugin:"));
    content.push(`  ${manifest.package}`);
    if (manifest.engine) {
      const engineInfo: string[] = [];
      if (manifest.engine.node) {engineInfo.push(`Node ${manifest.engine.node}`);}
      if (manifest.engine.kbCli) {engineInfo.push(`kb-cli ${manifest.engine.kbCli}`);}
      if (manifest.engine.module) {engineInfo.push(manifest.engine.module.toUpperCase());}
      if (engineInfo.length > 0) {
        content.push(`  ${colors.dim(`Requires: ${engineInfo.join(", ")}`)}`);
      }
    }
    content.push("");
  }
  
  if (manifest.permissions && manifest.permissions.length > 0) {
    content.push(colors.bold("Permissions:"));
    content.push(`  ${manifest.permissions.join(", ")}`);
    content.push("");
  }
  
  if (!registered.available) {
    content.push(colors.bold("Status:"));
    content.push(`  ${colors.red("Unavailable")}`);
    if (registered.unavailableReason) {
      content.push(`  ${colors.red(`Reason: ${registered.unavailableReason}`)}`);
    }
    if (registered.hint) {
      content.push(`  ${colors.yellow(`Hint: ${registered.hint}`)}`);
    }
    content.push("");
  }
  
  const totalTime = tracker.total();
  content.push(`Time: ${formatTiming(totalTime)}`);
  
  return box(`📋 ${fullName}`, content);
}

export function renderCommandHelp(command: Command, groupName?: string): string {
  const tracker = new TimingTracker();
  const fullName = groupName ? `${groupName} ${command.name}` : command.name;

  // Build content for box
  const content: string[] = [];

  if (command.describe) {
    content.push(colors.bold("Description:"));
    content.push(`  ${command.describe}`);
    content.push("");
  }

  if (command.longDescription) {
    content.push(colors.bold("Details:"));
    content.push(`  ${command.longDescription}`);
    content.push("");
  }

  if (command.examples && command.examples.length > 0) {
    content.push(colors.bold("Examples:"));
    for (const example of command.examples) {
      content.push(`  ${colors.dim(example)}`);
    }
    content.push("");
  }

  if (command.flags && command.flags.length > 0) {
    content.push(colors.bold("Options:"));
    for (const flag of command.flags) {
      const flagName = flag.alias ? `-${flag.alias}, --${flag.name}` : `--${flag.name}`;
      const typeInfo = flag.type !== "boolean" ? ` <${flag.type}>` : "";
      const required = flag.required ? colors.red(" (required)") : "";
      const defaultVal = flag.default !== undefined ? colors.dim(` (default: ${flag.default})`) : "";

      content.push(`  ${colors.cyan(flagName + typeInfo)}${required}${defaultVal}`);
      if (flag.description) {
        content.push(`    ${colors.dim(flag.description)}`);
      }
      if (flag.choices && flag.choices.length > 0) {
        content.push(`    ${colors.dim(`Choices: ${flag.choices.join(", ")}`)}`);
      }
    }
    content.push("");
  }

  // Add timing
  const totalTime = tracker.total();
  content.push(`Time: ${formatTiming(totalTime)}`);

  // Return box-formatted help
  return box(`📋 ${fullName}`, content);
}

/**
 * Generate man page content from manifest
 */
export function generateManPage(registered: RegisteredCommand): string {
  const manifest = registered.manifest;
  const lines: string[] = [];
  
  lines.push(`.TH ${manifest.id.toUpperCase().replace(':', ' ')} 1 "${new Date().toLocaleDateString('en-US')}" "KB Labs CLI"`);
  lines.push(`.SH NAME`);
  lines.push(`${manifest.id} \\- ${manifest.describe}`);
  lines.push(`.SH SYNOPSIS`);
  lines.push(`.B kb ${manifest.id}`);
  if (manifest.flags && manifest.flags.length > 0) {
    const flags = manifest.flags.map(f => `[\\fB--${f.name}\\fR]`).join(' ');
    lines.push(`[ ${flags} ]`);
  }
  lines.push(`.SH DESCRIPTION`);
  lines.push(manifest.longDescription || manifest.describe);
  
  if (manifest.flags && manifest.flags.length > 0) {
    lines.push(`.SH OPTIONS`);
    for (const flag of manifest.flags) {
      lines.push(`.TP`);
      lines.push(`\\fB--${flag.name}\\fR`);
      if (flag.alias) {
        lines.push(`\\fB-${flag.alias}\\fR`);
      }
      if (flag.description) {
        lines.push(flag.description);
      }
      if (flag.default !== undefined) {
        lines.push(`(default: ${flag.default})`);
      }
    }
  }
  
  if (manifest.examples && manifest.examples.length > 0) {
    lines.push(`.SH EXAMPLES`);
    for (const example of manifest.examples) {
      lines.push(`.PP`);
      lines.push(`\\fB${example}\\fR`);
    }
  }
  
  if (manifest.package) {
    lines.push(`.SH PLUGIN`);
    lines.push(`Provided by ${manifest.package}`);
  }
  
  lines.push(`.SH SEE ALSO`);
  lines.push(`kb(1), kb plugins ls(1)`);
  
  return lines.join('\n');
}

export function renderHelp(
  commands: RegisteredCommand[],
  options: { json?: boolean; onlyAvailable?: boolean }
): string | object {
  const filtered = options.onlyAvailable 
    ? commands.filter(c => c.available && !c.shadowed)
    : commands;
  
  if (options.json) {
    return {
      version: process.env.CLI_VERSION || '0.1.0',
      groups: groupCommands(filtered).map(group => ({
        name: group.name,
        commands: group.commands.map(cmd => ({
          id: cmd.manifest.id,
          aliases: cmd.manifest.aliases || [],
          describe: cmd.manifest.describe,
          available: cmd.available,
          source: cmd.source,
          shadowed: cmd.shadowed || false,
          ...(cmd.unavailableReason && { reason: cmd.unavailableReason }),
          ...(cmd.hint && { hint: cmd.hint }),
        })),
      })),
    };
  }
  
  return renderTextHelp(filtered, options);
}

function groupCommands(commands: RegisteredCommand[]): Array<{ name: string; commands: RegisteredCommand[] }> {
  const groups = new Map<string, RegisteredCommand[]>();
  
  for (const cmd of commands) {
    const group = cmd.manifest.group;
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(cmd);
  }
  
  return Array.from(groups.entries()).map(([name, commands]) => ({
    name,
    commands: commands.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
  }));
}

function renderTextHelp(commands: RegisteredCommand[], _options: { onlyAvailable?: boolean }): string {
  const lines: string[] = [];
  
  lines.push(colors.cyan(colors.bold("KB Labs CLI")) + " - Project management and automation tool");
  lines.push("");
  lines.push(colors.bold("Usage:") + " kb [command] [options]");
  lines.push("");
  
  const groups = groupCommands(commands);
  
  for (const group of groups.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(colors.bold(`${group.name} Commands:`));
    lines.push("");
    
    for (const cmd of group.commands) {
      const status = cmd.available ? '' : ' (unavailable)';
      const shadowed = cmd.shadowed ? ' (shadowed)' : '';
      lines.push(`  ${colors.cyan(cmd.manifest.id.padEnd(20))}  ${colors.dim(cmd.manifest.describe)}${status}${shadowed}`);
      
      if (!cmd.available && cmd.unavailableReason) {
        lines.push(`    ${colors.red(`Reason: ${cmd.unavailableReason}`)}`);
        if (cmd.hint) {
          lines.push(`    ${colors.yellow(`Hint: ${cmd.hint}`)}`);
        }
      }
    }
    lines.push("");
  }
  
  lines.push(colors.bold("Global Options:"));
  lines.push("");
  lines.push(`  ${colors.cyan("--help".padEnd(12))}  ${colors.dim("Show help information")}`);
  lines.push(`  ${colors.cyan("--version".padEnd(12))}  ${colors.dim("Show CLI version")}`);
  lines.push(`  ${colors.cyan("--json".padEnd(12))}  ${colors.dim("Output in JSON format")}`);
  lines.push(`  ${colors.cyan("--only-available".padEnd(12))}  ${colors.dim("Show only available commands")}`);
  lines.push(`  ${colors.cyan("--quiet".padEnd(12))}  ${colors.dim("Suppress detailed output")}`);
  lines.push("");
  
  return lines.join("\n");
}
