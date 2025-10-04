import { Command } from "@kb-labs/cli-core";
import type { Context } from "@kb-labs/cli-core";
import { getLogger } from '@kb-labs/core-sys';
import { createProfileServiceFromConfig } from '@kb-labs/core-profiles';
import { resolveConfig } from '@kb-labs/core-config';

export class ProfilesResolveCommand extends Command {
  name = "profiles resolve";
  description = "Resolve a profile configuration";

  flags = {
    name: {
      type: "string",
      default: "default",
      description: "Profile name to resolve",
    },
    product: {
      type: "string",
      description: "Specific product configuration to extract",
    },
    json: {
      type: "boolean",
      default: false,
      description: "Output result in JSON format",
    },
    "no-cache": {
      type: "boolean",
      default: false,
      description: "Disable caching and force fresh resolution",
    },
  };

  async execute(ctx: Context): Promise<number> {
    const { name, product, json, "no-cache": noCache } = ctx.flags;
    const logger = getLogger('profiles-resolve');

    logger.debug('Starting profile resolution', { name, product, json, noCache });

    try {
      // Load configuration
      const config = await resolveConfig({ cwd: process.cwd() });
      logger.debug('Configuration loaded', { config });

      // Create profile service
      const service = createProfileServiceFromConfig(config.profiles, process.cwd());
      logger.debug('Profile service created');

      // Resolve profile (with or without cache)
      const resolved = await service.resolveProfile({ name, strict: false });
      logger.debug('Profile resolved successfully', {
        name: resolved.name,
        kind: resolved.kind,
        scope: resolved.scope,
        productsCount: Object.keys(resolved.products).length,
        filesCount: resolved.files.length,
      });

      // If specific product requested, extract it
      let result: any = resolved;
      if (product) {
        if (!(product in resolved.products)) {
          const errorMsg = `Product '${product}' not found in profile '${resolved.name}'`;
          logger.error(errorMsg, { availableProducts: Object.keys(resolved.products) });

          if (json) {
            ctx.presenter.json({
              ok: false,
              error: {
                message: errorMsg,
                availableProducts: Object.keys(resolved.products),
              },
            });
          } else {
            ctx.presenter.error(`❌ ${errorMsg}\n`);
            ctx.presenter.error(`   Available products: ${Object.keys(resolved.products).join(", ")}\n`);
          }
          return 1;
        }

        result = {
          product,
          config: resolved.products[product],
          profile: {
            name: resolved.name,
            kind: resolved.kind,
            scope: resolved.scope,
          },
        };
        logger.debug('Product configuration extracted', { product });
      }

      if (json) {
        ctx.presenter.json({
          ok: true,
          ...result,
          meta: resolved.meta,
        });
      } else {
        // Human-readable summary
        if (product) {
          ctx.presenter.write(`📦 Product: ${product}\n`);
          ctx.presenter.write(`📋 Profile: ${resolved.name} (${resolved.kind}, ${resolved.scope})\n`);
          ctx.presenter.write(`⚙️  Configuration:\n`);
          ctx.presenter.write(JSON.stringify(result.config, null, 2));
          ctx.presenter.write("\n");
        } else {
          ctx.presenter.write("📋 Profile Summary\n");
          ctx.presenter.write("==================\n");
          ctx.presenter.write(`Name: ${resolved.name}\n`);
          ctx.presenter.write(`Kind: ${resolved.kind}\n`);
          ctx.presenter.write(`Scope: ${resolved.scope}\n`);
          ctx.presenter.write(`Products: ${Object.keys(resolved.products).join(", ")}\n`);
          ctx.presenter.write(`Files: ${resolved.files.length}\n`);

          if (resolved.meta) {
            ctx.presenter.write("\n📊 Metadata:\n");
            for (const [key, value] of Object.entries(resolved.meta)) {
              ctx.presenter.write(`${key}: ${value}\n`);
            }
          }
        }
      }

      return 0;
    } catch (error: any) {
      logger.error('Profile resolution failed', { error, name, product, noCache });

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
}
