import type { Command } from "../../types";

// Simple mock profile data for demonstration
interface MockProfile {
  name: string;
  kind: string;
  scope: string;
  products: Record<string, any>;
  files: string[];
  meta?: Record<string, any>;
}

function createMockProfile(name: string): MockProfile {
  return {
    name,
    kind: 'project',
    scope: 'local',
    products: {
      'example-product': {
        config: 'example-config',
        enabled: true
      },
      'test-product': {
        config: 'test-config',
        enabled: false
      }
    },
    files: ['package.json', 'README.md'],
    meta: {
      resolveTime: Date.now()
    }
  };
}

export const profilesResolve: Command = {
  name: "profiles:resolve",
  describe: "Resolve a profile configuration",

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
      // Create mock profile for demonstration
      const resolved = createMockProfile(name as string);

      // If specific product requested, extract it
      let result: any = resolved;
      if (product && typeof product === 'string') {
        if (!(product in resolved.products)) {
          const errorMsg = `Product '${product}' not found in profile '${resolved.name}'`;

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
          config: resolved.products[product as string],
          profile: {
            name: resolved.name,
            kind: resolved.kind,
            scope: resolved.scope,
          },
        };
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
