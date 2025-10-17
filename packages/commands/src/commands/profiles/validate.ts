import type { Command } from "../../types";

// TODO: Import real utilities from core packages when they are available
// import { resolveConfig } from "@kb-labs/core-config";
// import { createProfileServiceFromConfig, ProfileService } from "@kb-labs/core-profiles";
// import { getLogger } from "@kb-labs/core-sys";

// Temporary stubs to prevent build errors
const resolveConfig = (options: any) => ({
  value: {
    profiles: {
      rootDir: '.kb/profiles',
      defaultName: 'default',
      strict: true
    }
  }
});

const createProfileServiceFromConfig = (config: any, cwd: string) => ({
  resolve: async (options: any) => ({
    name: options.name || 'default',
    kind: 'development',
    scope: 'local',
    products: {},
    files: [],
    meta: {}
  })
});

const getLogger = (name: string) => ({
  debug: (message: string, meta?: any) => console.log(`[${name}] ${message}`, meta || ''),
  info: (message: string, meta?: any) => console.log(`[${name}] ${message}`, meta || ''),
  warn: (message: string, meta?: any) => console.warn(`[${name}] ${message}`, meta || ''),
  error: (message: string, meta?: any) => console.error(`[${name}] ${message}`, meta || '')
});

export const validate: Command = {
  name: "validate",
  category: "profiles",
  describe: "Validate a profile configuration",
  longDescription: "Validates a profile configuration against the schema and checks for errors",
  aliases: ["profiles:validate"],
  flags: [
    { name: "name", type: "string", default: "default", description: "Profile name to validate" },
    { name: "strict", type: "boolean", default: true, description: "Use strict validation mode" },
    { name: "json", type: "boolean", description: "Output in JSON format" }
  ],
  examples: [
    "kb profiles validate",
    "kb profiles validate --name=production",
    "kb profiles validate --strict=false"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      name: "default",
      strict: true,
      json: false,
    };

    // Merge with provided flags
    const finalFlags = { ...defaultFlags, ...flags };
    const { name, strict, json } = finalFlags;

    try {
      const logger = getLogger('profiles-validate');

      logger.debug('Starting profile validation', {
        name,
        strict,
        cwd: process.cwd()
      });

      // Load configuration
      const configResult = resolveConfig({
        defaults: {
          profiles: {
            rootDir: '.kb/profiles',
            defaultName: 'default',
            strict: true
          }
        }
      });

      // Create profile service
      const service = createProfileServiceFromConfig(configResult.value.profiles, process.cwd());

      // Resolve profile with validation
      const result = await service.resolve({
        name: name as string,
        strict: strict as boolean
      });

      if (json) {
        // JSON output
        ctx.presenter.json({
          ok: true,
          profile: {
            name: result.name,
            kind: result.kind,
            scope: result.scope,
            products: Object.keys(result.products || {}),
            filesCount: result.files?.length || 0
          },
          meta: result.meta
        });
      } else {
        // Success output
        ctx.presenter.write("✅ Profile valid\n");
        ctx.presenter.write(`\n   Name: ${result.name}\n`);
        ctx.presenter.write(`   Kind: ${result.kind}\n`);
        ctx.presenter.write(`   Scope: ${result.scope}\n`);
        ctx.presenter.write(`   Products: ${Object.keys(result.products || {}).join(", ")}\n`);
        ctx.presenter.write(`   Files: ${result.files?.length || 0}\n`);
      }

      return 0;
    } catch (error: any) {

      if (json) {
        const errorResult = {
          ok: false,
          errors: [{
            message: error.message,
            code: error.name || 'VALIDATION_ERROR',
            ...(error.cause && { cause: error.cause }),
          }],
        };
        ctx.presenter.json(errorResult);
      } else {
        ctx.presenter.error("❌ Validation failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      // Return appropriate exit code based on error type
      if (error.name === 'SchemaValidationError' || error.name === 'ProfileSchemaError') {
        return 2; // Schema validation errors
      }
      return 1; // Other errors
    }
  }
};
