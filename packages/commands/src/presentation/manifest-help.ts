import {
  colors,
  box,
  formatTiming,
  TimingTracker,
  type RegisteredCommand,
} from "./shared";

export function renderManifestCommandHelp(
  registered: RegisteredCommand,
): string {
  const tracker = new TimingTracker();
  const manifest = registered.manifest;

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

  const permissions = manifest.manifestV2?.permissions ?? manifest.permissions;

  if (permissions) {
    content.push(colors.bold("Permissions:"));
    for (const [scope, value] of Object.entries(permissions)) {
      content.push(`  ${colors.cyan(scope)}: ${JSON.stringify(value)}`);
    }
    content.push("");
  }

  if (manifest.flags && manifest.flags.length > 0) {
    content.push(colors.bold("Flags:"));
    for (const flag of manifest.flags) {
      const label = flag.alias
        ? `--${flag.name}, -${flag.alias}`
        : `--${flag.name}`;
      const desc = flag.describe ?? flag.description
        ? ` – ${flag.describe ?? flag.description}`
        : "";
      content.push(`  ${colors.cyan(label)}${colors.dim(desc)}`);
      if (flag.examples) {
        for (const example of flag.examples) {
          content.push(`    ${colors.dim(example)}`);
        }
      }
    }
    content.push("");
  }

  if (manifest.examples?.length) {
    content.push(colors.bold("Usage:"));
    for (const example of manifest.examples.slice(0, 3)) {
      content.push(`  ${colors.dim(`kb ${example}`)}`);
    }
    content.push("");
  }

  const totalTime = tracker.total();
  content.push("");
  content.push(`Time: ${formatTiming(totalTime)}`);

  return box(manifest.id, content);
}

