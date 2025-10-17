import type { Command, CommandGroup } from "../types";
import { colors } from "@kb-labs/cli-core";

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

export function renderCommandHelp(command: Command, groupName?: string): string {
  const lines: string[] = [];
  const fullName = groupName ? `${groupName} ${command.name}` : command.name;

  lines.push(colors.cyan(colors.bold(`📋 ${fullName}`)));
  lines.push("");

  if (command.describe) {
    lines.push(colors.bold("Description:"));
    lines.push(`  ${command.describe}`);
    lines.push("");
  }

  if (command.longDescription) {
    lines.push(colors.bold("Details:"));
    lines.push(`  ${command.longDescription}`);
    lines.push("");
  }

  if (command.examples && command.examples.length > 0) {
    lines.push(colors.bold("Examples:"));
    for (const example of command.examples) {
      lines.push(`  ${colors.dim(example)}`);
    }
    lines.push("");
  }

  if (command.flags && command.flags.length > 0) {
    lines.push(colors.bold("Options:"));
    for (const flag of command.flags) {
      const flagName = flag.alias ? `-${flag.alias}, --${flag.name}` : `--${flag.name}`;
      const typeInfo = flag.type !== "boolean" ? ` <${flag.type}>` : "";
      const required = flag.required ? colors.red(" (required)") : "";
      const defaultVal = flag.default !== undefined ? colors.dim(` (default: ${flag.default})`) : "";

      lines.push(`  ${colors.cyan(flagName + typeInfo)}${required}${defaultVal}`);
      if (flag.description) {
        lines.push(`    ${colors.dim(flag.description)}`);
      }
      if (flag.choices && flag.choices.length > 0) {
        lines.push(`    ${colors.dim(`Choices: ${flag.choices.join(", ")}`)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
