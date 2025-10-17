import type { Command } from "../../types";
import { promises as fs } from "fs";
import { join, dirname } from "path";

// Profile types
type ProfileKind = "review" | "tests" | "docs" | "assistant" | "composite";
type ProfileScope = "repo" | "package" | "dir";

interface ProfileTemplate {
  $schema: string;
  name: string;
  kind: ProfileKind;
  scope: ProfileScope;
  version: string;
  extends: string[];
  overrides: any[];
  products: Record<string, { enabled: boolean;[key: string]: any }>;
  metadata: Record<string, any>;
}

// Simple logger implementation
function getLogger(name: string) {
  const logLevel = process.env.KB_PROFILES_LOG_LEVEL || 'info';

  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[logLevel as keyof typeof levels] || 1;

  return {
    debug: (msg: string, meta?: any) => {
      if (currentLevel <= 0) {
        console.log(`[${name}] DEBUG: ${msg}`, meta || '');
      }
    },
    info: (msg: string, meta?: any) => {
      if (currentLevel <= 1) {
        console.log(`[${name}] INFO: ${msg}`, meta || '');
      }
    },
    warn: (msg: string, meta?: any) => {
      if (currentLevel <= 2) {
        console.warn(`[${name}] WARN: ${msg}`, meta || '');
      }
    },
    error: (msg: string, meta?: any) => {
      if (currentLevel <= 3) {
        console.error(`[${name}] ERROR: ${msg}`, meta || '');
      }
    }
  };
}

// Helper functions
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getDefaultProduct(kind: ProfileKind): string {
  switch (kind) {
    case 'review': return 'review';
    case 'tests': return 'tests';
    case 'docs': return 'docs';
    case 'assistant': return 'assistant';
    case 'composite': return 'review'; // default for composite
    default: return 'review';
  }
}

function createProfileTemplate(
  name: string,
  kind: ProfileKind,
  scope: ProfileScope,
  preset?: string
): ProfileTemplate {
  const defaultProduct = getDefaultProduct(kind);

  const template: ProfileTemplate = {
    $schema: "https://schemas.kb-labs.dev/profile/profile.schema.json",
    name,
    kind,
    scope,
    version: "1.0.0",
    extends: [],
    overrides: [],
    products: {
      [defaultProduct]: { enabled: true }
    },
    metadata: {}
  };

  // Add preset to extends if provided
  if (preset) {
    template.extends.push(preset);
  }

  return template;
}

export const init: Command = {
  name: "init",
  category: "profiles",
  describe: "Initialize a new profile configuration",
  longDescription: "Creates a new profile configuration file with specified kind, scope, and optional preset",
  aliases: ["profiles:init"],
  flags: [
    { name: "name", type: "string", default: "default", description: "Profile name" },
    { name: "kind", type: "string", choices: ["review", "tests", "docs", "assistant", "composite"], default: "composite", description: "Profile kind" },
    { name: "scope", type: "string", choices: ["repo", "package", "dir"], default: "repo", description: "Profile scope" },
    { name: "preset", type: "string", description: "Preset to extend" },
    { name: "yes", type: "boolean", description: "Skip confirmation prompts" },
    { name: "dry-run", type: "boolean", description: "Show what would be created without making changes" },
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: [
    "kb profiles init",
    "kb profiles init --name=production --kind=review",
    "kb profiles init --scope=package --preset=typescript",
    "kb profiles init --dry-run"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      name: "default",
      kind: "composite",
      scope: "repo",
      preset: undefined,
      yes: false,
      "dry-run": false,
      json: false,
    };

    // Merge with provided flags
    const finalFlags = { ...defaultFlags, ...flags };
    const {
      name,
      kind,
      scope,
      preset,
      yes,
      "dry-run": dryRun,
      json
    } = finalFlags;

    const logger = getLogger('profiles-init');
    const result = {
      ok: true,
      created: [] as string[],
      skipped: [] as string[],
      warnings: [] as string[]
    };

    try {
      // Validate inputs
      const validKinds: ProfileKind[] = ["review", "tests", "docs", "assistant", "composite"];
      const validScopes: ProfileScope[] = ["repo", "package", "dir"];

      if (!validKinds.includes(kind as ProfileKind)) {
        throw new Error(`Invalid kind: ${kind}. Must be one of: ${validKinds.join(", ")}`);
      }

      if (!validScopes.includes(scope as ProfileScope)) {
        throw new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(", ")}`);
      }

      const profileName = name as string;
      const profileKind = kind as ProfileKind;
      const profileScope = scope as ProfileScope;
      const presetValue = preset as string | undefined;

      logger.debug('Starting profile initialization', {
        name: profileName,
        kind: profileKind,
        scope: profileScope,
        preset: presetValue,
        dryRun,
        json
      });

      // Determine profile directory and file paths
      const profileDir = join(process.cwd(), '.kb', 'profiles', profileName);
      const profileFile = join(profileDir, 'profile.json');

      // Check if profile already exists
      if (await fileExists(profileFile)) {
        const errorMsg = `Profile '${profileName}' already exists at ${profileFile}`;

        if (yes) {
          // Non-interactive mode - return error
          logger.error(errorMsg);
          result.ok = false;
          result.warnings.push(errorMsg);

          if (json) {
            ctx.presenter.json(result);
          } else {
            ctx.presenter.error(`❌ ${errorMsg}\n`);
            ctx.presenter.error("Use --yes flag to overwrite existing profiles (not implemented yet)\n");
          }
          return 1;
        } else {
          // Interactive mode - ask for confirmation (not implemented in this demo)
          result.warnings.push(`${errorMsg} - skipping`);
          result.skipped.push(profileFile);
        }
      }

      // Create profile template
      const template = createProfileTemplate(
        profileName,
        profileKind,
        profileScope,
        presetValue
      );

      logger.debug('Created profile template', { template });

      if (dryRun) {
        // Dry run - just show what would be created
        if (json) {
          result.created.push(profileFile);
          ctx.presenter.json(result);
        } else {
          ctx.presenter.write("🔍 Dry run - would create:\n");
          ctx.presenter.write(`   Directory: ${profileDir}\n`);
          ctx.presenter.write(`   File: ${profileFile}\n`);
          ctx.presenter.write(`   Profile: ${profileName} (${profileKind}, ${profileScope})\n`);
          if (presetValue) {
            ctx.presenter.write(`   Preset: ${presetValue}\n`);
          }
        }
        return 0;
      }

      // Create directory and file
      await ensureDir(profileDir);
      await fs.writeFile(profileFile, JSON.stringify(template, null, 2) + '\n');

      result.created.push(profileDir);
      result.created.push(profileFile);

      logger.info('Profile created successfully', {
        name: profileName,
        path: profileFile,
        kind: profileKind,
        scope: profileScope
      });

      if (json) {
        ctx.presenter.json(result);
      } else {
        ctx.presenter.write("✅ Profile created successfully\n");
        ctx.presenter.write(`   Name: ${profileName}\n`);
        ctx.presenter.write(`   Kind: ${profileKind}\n`);
        ctx.presenter.write(`   Scope: ${profileScope}\n`);
        ctx.presenter.write(`   Path: ${profileFile}\n`);
        if (presetValue) {
          ctx.presenter.write(`   Preset: ${presetValue}\n`);
        }
        ctx.presenter.write(`   Products: ${Object.keys(template.products).join(", ")}\n`);
      }

      return 0;
    } catch (error: any) {
      logger.error('Profile initialization failed', { error });

      result.ok = false;

      if (json) {
        ctx.presenter.json({
          ...result,
          error: {
            message: error.message,
            code: error.code || 'INIT_ERROR'
          }
        });
      } else {
        ctx.presenter.error("❌ Profile initialization failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.code) {
          ctx.presenter.error(`   Code: ${error.code}\n`);
        }
      }

      return 1;
    }
  }
};
