export type GlobalFlags = {
  json?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
  profile?: string;
  profilesDir?: string;
  noColor?: boolean;
  verbose?: boolean;
  debug?: boolean;
  help?: boolean;
  version?: boolean;
  quiet?: boolean;
};

export function parseArgs(argv: string[]): {
  cmdPath: string[];
  rest: string[];
  global: GlobalFlags;
  flagsObj: Record<string, unknown>;
} {
  const args = [...argv];
  const global: GlobalFlags = {};
  const flagsObj: Record<string, unknown> = {};
  const cmdPath: string[] = [];

  while (args.length) {
    const a = args[0]!;
    if (a === "--") {
      args.shift();
      break;
    }
    if (a.startsWith("-")) {
      args.shift();
      switch (a) {
        case "--json":
          global.json = true;
          break;
        case "--help":
          global.help = true;
          break;
        case "--version":
          global.version = true;
          break;
        case "--no-color":
          global.noColor = true;
          break;
        case "--quiet":
          global.quiet = true;
          break;
        case "--debug":
          global.debug = true;
          global.logLevel = "debug";
          break;
        case "--verbose":
          global.verbose = true;
          global.logLevel = "debug";
          break;
        case "--log-level":
          global.logLevel = String(args.shift()) as
            | "debug"
            | "info"
            | "warn"
            | "error";
          break;
        case "--profile":
          global.profile = String(args.shift());
          break;
        case "--profiles-dir":
          global.profilesDir = String(args.shift());
          break;
        default: {
          // generic key/value or boolean
          // Support both --flag=value and --flag value syntax
          const stripped = a.replace(/^--/, "");

          if (stripped.includes("=")) {
            // --flag=value syntax
            const [key, ...valueParts] = stripped.split("=");
            if (key) {
              const value = valueParts.join("="); // rejoin in case value contains =
              flagsObj[key] = value;
            }
          } else {
            // --flag value or --flag (boolean) syntax
            const key = stripped;
            const maybe = args[0];
            if (!maybe || String(maybe).startsWith("-")) {
              flagsObj[key] = true;
            } else {
              flagsObj[key] = args.shift();
            }
          }
        }
      }
    } else {
      cmdPath.push(String(args.shift()));
      // поддерживаем команды из 1–2 слов: e.g. "init", "init", "profile"
      if (cmdPath.length === 2) {
        break;
      }
    }
  }
  const rest = args;
  return { cmdPath, rest, global, flagsObj };
}
