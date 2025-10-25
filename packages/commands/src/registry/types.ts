/**
 * @kb-labs/cli-commands/registry
 * Type definitions for the plugin system
 */

export interface CommandManifest {
  manifestVersion: '1.0';    // Required for validation
  id: string;                // "mind:pack"
  aliases?: string[];        // ["mind-pack", "m:pack"]
  group: string;             // "mind"
  describe: string;
  longDescription?: string;
  requires?: string[];       // ["@kb-labs/mind-pack"]
  flags?: FlagDefinition[];
  examples?: string[];
  loader: () => Promise<CommandModule>;
}

export interface FlagDefinition {
  name: string;              // "profile"
  type: "string" | "boolean" | "number" | "array";
  alias?: string;            // "p" - single letter
  default?: any;
  description?: string;
  choices?: string[];        // ["dev", "prod"] - only for string type
  required?: boolean;
}

export interface RegisteredCommand {
  manifest: CommandManifest;
  available: boolean;
  unavailableReason?: string;
  hint?: string;
  source: 'workspace' | 'node_modules' | 'builtin';
  shadowed: boolean;         // True if overridden by higher priority
}

export interface CommandModule {
  run: (ctx: any, argv: string[], flags: Record<string, any>) => Promise<number | void>;
}

export interface DiscoveryResult {
  source: 'workspace' | 'node_modules' | 'builtin';
  packageName: string;
  manifestPath: string;      // Absolute JS path (POSIX)
  pkgRoot: string;           // Absolute package directory (POSIX)
  manifests: CommandManifest[];
}

export interface GlobalFlags {
  json?: boolean;
  onlyAvailable?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  help?: boolean;
  version?: boolean;
}

export interface CacheFile {
  version: string;           // Node version
  cliVersion: string;        // CLI version
  timestamp: number;
  mtimes: Record<string, number>;
  results: DiscoveryResult[];
}

export type AvailabilityCheck = 
  | { available: true }
  | { available: false; reason: string; hint?: string }

