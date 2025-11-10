import {
  colors,
  collectManifestVersions,
  box,
  formatTiming,
  TimingTracker,
  type RegisteredCommand,
} from "./shared";

export function renderProductHelp(
  groupName: string,
  commands: RegisteredCommand[],
): string {
  const tracker = new TimingTracker();
  const content: string[] = [];

  const manifestVersions = collectManifestVersions(commands);
  if (manifestVersions.length > 0) {
    content.push(colors.bold("Manifest:"));
    content.push(`  ${colors.cyan(manifestVersions.join(" + "))}`);
    content.push("");
  }

  content.push(colors.bold("Available commands:"));
  content.push("");

  const availableMap = new Map<string, RegisteredCommand>();
  const unavailableMap = new Map<string, RegisteredCommand>();

  for (const cmd of commands) {
    if (cmd.available && !cmd.shadowed) {
      if (!availableMap.has(cmd.manifest.id)) {
        availableMap.set(cmd.manifest.id, cmd);
      }
    } else if (!unavailableMap.has(cmd.manifest.id)) {
      unavailableMap.set(cmd.manifest.id, cmd);
    }
  }

  const available = Array.from(availableMap.values()).sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id),
  );
  const unavailable = Array.from(unavailableMap.values()).sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id),
  );

  const maxLength = Math.max(
    ...[...available, ...unavailable].map((c) => c.manifest.id.length),
    20,
  );

  for (const cmd of available) {
    const status = colors.green("✓");
    const paddedId = cmd.manifest.id.padEnd(maxLength);
    content.push(
      `  ${status} ${colors.cyan(paddedId)}  ${colors.dim(
        cmd.manifest.describe,
      )}`,
    );

    if (cmd.manifest.examples && cmd.manifest.examples.length > 0) {
      for (const example of cmd.manifest.examples.slice(0, 2) as string[]) {
        content.push(`     ${colors.dim(example)}`);
      }
    }
  }

  if (unavailable.length > 0) {
    content.push("");
    content.push(colors.dim("Unavailable:"));
    for (const cmd of unavailable) {
      const status = colors.red("✗");
      const paddedId = cmd.manifest.id.padEnd(maxLength);
      content.push(
        `  ${status} ${colors.dim(paddedId)}  ${colors.dim(
          cmd.manifest.describe,
        )}`,
      );

      if (cmd.unavailableReason) {
        content.push(
          `     ${colors.red(`Reason: ${cmd.unavailableReason}`)}`,
        );
      }
      if (cmd.hint) {
        content.push(`     ${colors.yellow(`Hint: ${cmd.hint}`)}`);
      }
    }
  }

  content.push("");
  content.push(colors.bold("Next Steps:"));
  content.push("");

  const uniqueCommands = new Map<string, RegisteredCommand>();
  for (const cmd of available) {
    if (!uniqueCommands.has(cmd.manifest.id)) {
      uniqueCommands.set(cmd.manifest.id, cmd);
    }
  }

  const nextSteps = Array.from(uniqueCommands.values())
    .slice(0, 3)
    .map(
      (cmd) =>
        `  ${colors.cyan(`kb ${cmd.manifest.id}`)}  ${colors.dim(
          cmd.manifest.describe,
        )}`,
    );

  if (nextSteps.length === 0) {
    nextSteps.push(`  ${colors.dim("No available commands in this product")}`);
  } else {
    nextSteps.push("");
    nextSteps.push(
      `  ${colors.dim(
        `Use 'kb ${groupName}:<command> --help' for detailed help`,
      )}`,
    );
  }

  content.push(...nextSteps);
  content.push("");
  content.push(
    colors.dim("Use 'kb --help' to see all products and system commands."),
  );

  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);

  return box(groupName, content);
}

