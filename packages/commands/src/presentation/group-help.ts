import { colors, type CommandGroup } from "./shared";

export function renderGroupHelp(group: CommandGroup): string {
  const lines: string[] = [];

  lines.push(
    colors.cyan(colors.bold(`📦 ${group.name}`)) +
      " - " +
      colors.dim(group.describe),
  );
  lines.push("");
  lines.push(colors.bold("Available commands:"));
  lines.push("");

  const sortedCommands = [...group.commands].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const maxNameLength = Math.max(...sortedCommands.map((cmd) => cmd.name.length));

  for (const cmd of sortedCommands) {
    const paddedName = cmd.name.padEnd(maxNameLength);
    const description = cmd.describe || "No description";
    lines.push(`  ${colors.cyan(paddedName)}  ${colors.dim(description)}`);

    if (cmd.examples && cmd.examples.length > 0) {
      for (const example of cmd.examples.slice(0, 2)) {
        lines.push(`    ${colors.dim(example)}`);
      }
    }
  }

  lines.push("");
  lines.push(
    colors.dim(
      `Use 'kb ${group.name} <command> --help' for more information on a command.`,
    ),
  );

  return lines.join("\n");
}

