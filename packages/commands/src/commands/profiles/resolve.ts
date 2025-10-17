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
  }),
  resolveCached: async (options: any) => ({
    name: options.name || 'default',
    kind: 'development',
    scope: 'local',
    products: {},
    files: [],
    meta: {}
  }),
  getProductConfig: (profile: any, productName: string) => ({
    name: productName,
    enabled: true,
    config: {}
  })
});

const getLogger = (name: string) => ({
  debug: (message: string, meta?: any) => console.log(`[${name}] ${message}`, meta || ''),
  info: (message: string, meta?: any) => console.log(`[${name}] ${message}`, meta || ''),
  warn: (message: string, meta?: any) => console.warn(`[${name}] ${message}`, meta || ''),
  error: (message: string, meta?: any) => console.error(`[${name}] ${message}`, meta || '')
});

export const resolve: Command = {
  name: "resolve",
  category: "profiles",
  describe: "Resolve a profile configuration",
  longDescription: "Resolves and displays a profile configuration with all its products and settings",
  aliases: ["profiles:resolve"],
  flags: [
    { name: "name", type: "string", default: "default", description: "Profile name to resolve" },
    { name: "product", type: "string", description: "Specific product to resolve" },
    { name: "json", type: "boolean", description: "Output in JSON format" },
    { name: "no-cache", type: "boolean", description: "Skip cache and resolve fresh" }
  ],
  examples: [
    "kb profiles resolve",
    "kb profiles resolve --name=production",
    "kb profiles resolve --product=frontend",
    "kb profiles resolve --no-cache"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      name: "default",
      product: undefined,
      json: false,
      "no-cache": false,
    };

    // Merge with provided flags
    const finalFlags = { ...defaultFlags, ...flags };
    const { name, product, json, "no-cache": noCache } = finalFlags;

    try {
      const logger = getLogger('profiles-resolve');

      logger.debug('Starting profile resolution', {
        name,
        product,
        noCache,
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

      // Resolve profile (cached or fresh)
      const result = noCache
        ? await service.resolve({ name: name as string, product: product as string | undefined })
        : await service.resolveCached({ name: name as string, product: product as string | undefined });

      let output: any = result;

      // If specific product requested, filter to that product
      if (product && typeof product === 'string') {
        if (!result.products || !(product in result.products)) {
          if (json) {
            ctx.presenter.json({
              ok: false,
              error: `Product '${product}' not found in profile '${result.name}'`,
              availableProducts: Object.keys(result.products || {})
            });
          } else {
            ctx.presenter.error(`❌ Product '${product}' not found in profile '${result.name}'\n`);
            ctx.presenter.error(`\n   Available products: ${Object.keys(result.products || {}).join(", ")}\n`);
          }
          return 1;
        }

        const productConfig = service.getProductConfig(result, product);
        output = {
          product,
          config: productConfig,
          profile: {
            name: result.name,
            kind: result.kind,
            scope: result.scope
          },
          meta: result.meta
        };
      }

      if (json) {
        ctx.presenter.json({
          ok: true,
          ...output
        });
      } else {
        ctx.presenter.write("📋 Profile Summary\n");
        ctx.presenter.write("==================\n");
        ctx.presenter.write(`\nName: ${result.name}\n`);
        ctx.presenter.write(`Kind: ${result.kind}\n`);
        ctx.presenter.write(`Scope: ${result.scope}\n`);
        ctx.presenter.write(`Products: ${Object.keys(result.products || {}).join(", ")}\n`);
        ctx.presenter.write(`Files: ${result.files?.length || 0}\n`);

        if (result.meta) {
          ctx.presenter.write(`\n📊 Metadata:\n`);
          Object.entries(result.meta).forEach(([key, value]) => {
            ctx.presenter.write(`${key}: ${value}\n`);
          });
        }
      }

      return 0;
    } catch (error: any) {

      if (json) {
        const errorResult = {
          ok: false,
          error: {
            message: error.message,
            code: error.name || 'RESOLUTION_ERROR',
            ...(error.cause && { cause: error.cause }),
          },
        };
        ctx.presenter.json(errorResult);
      } else {
        ctx.presenter.error("❌ Resolution failed\n");
        ctx.presenter.error(`   Error: ${error.message}\n`);
        if (error.cause) {
          ctx.presenter.error(`   Cause: ${error.cause}\n`);
        }
      }

      return 1;
    }
  }
};