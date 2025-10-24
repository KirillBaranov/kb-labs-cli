import type { Command } from "../../types";
import { loadBundle, ProductId } from '@kb-labs/core-bundle';

export const print: Command = {
  name: "print",
  category: "bundle",
  describe: "Print bundle configuration",
  longDescription: "Loads and displays bundle configuration for a product",
  aliases: ["bundle:print"],
  flags: [
    { 
      name: "product", 
      type: "string", 
      required: true, 
      description: "Product ID (aiReview, aiDocs, devlink, release, devkit)" 
    },
    { 
      name: "profile", 
      type: "string", 
      default: "default", 
      description: "Profile key from workspace config" 
    },
    { 
      name: "json", 
      type: "boolean", 
      description: "Output in JSON format" 
    }
  ],
  examples: [
    "kb bundle print --product=aiReview",
    "kb bundle print --product=aiReview --profile=production",
    "kb bundle print --product=aiReview --json"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      product: undefined as string | undefined,
      profile: "default",
      json: false,
    };

    // Merge with provided flags
    const finalFlags = { ...defaultFlags, ...flags };
    const { product, profile, json } = finalFlags;

    if (!product) {
      ctx.presenter.error("❌ Product is required\n");
      ctx.presenter.error("   Use --product=aiReview|aiDocs|devlink|release|devkit\n");
      return 1;
    }

    // Validate product ID
    const validProducts: ProductId[] = ['aiReview', 'aiDocs', 'devlink', 'release', 'devkit'];
    if (!validProducts.includes(product as ProductId)) {
      ctx.presenter.error(`❌ Invalid product: ${product}\n`);
      ctx.presenter.error(`   Valid products: ${validProducts.join(', ')}\n`);
      return 1;
    }

    try {
      // Load bundle
      const bundle = await loadBundle({
        cwd: process.cwd(),
        product: product as ProductId,
        profileKey: profile as string
      });

      if (json) {
        // JSON output with schema version
        ctx.presenter.json({
          schemaVersion: "1.0",
          product: bundle.product,
          config: bundle.config,
          profile: bundle.profile,
          artifacts: {
            summary: bundle.artifacts.summary
          },
          policy: {
            bundle: bundle.policy.bundle || "permit-all"
          },
          trace: bundle.trace
        });
      } else {
        // Human-readable output
        ctx.presenter.write("📦 Bundle Configuration\n\n");
        
        // Config summary
        ctx.presenter.write("Config:\n");
        const configKeys = Object.keys(bundle.config as any || {});
        if (configKeys.length > 0) {
          ctx.presenter.write(`  ${configKeys.join(', ')}\n`);
        } else {
          ctx.presenter.write("  (empty)\n");
        }
        
        // Profile info
        ctx.presenter.write("\nProfile:\n");
        ctx.presenter.write(`  Key: ${bundle.profile.key}\n`);
        ctx.presenter.write(`  Name: ${bundle.profile.name}\n`);
        ctx.presenter.write(`  Version: ${bundle.profile.version}\n`);
        if (bundle.profile.overlays && bundle.profile.overlays.length > 0) {
          ctx.presenter.write(`  Overlays: ${bundle.profile.overlays.join(', ')}\n`);
        }
        
        // Artifacts summary
        ctx.presenter.write("\nArtifacts Summary:\n");
        const artifactKeys = Object.keys(bundle.artifacts.summary);
        if (artifactKeys.length > 0) {
          for (const key of artifactKeys) {
            const patterns = bundle.artifacts.summary[key];
            ctx.presenter.write(`  ${key}: ${patterns?.length || 0} pattern(s)\n`);
          }
        } else {
          ctx.presenter.write("  (no artifacts)\n");
        }
        
        // Policy info
        ctx.presenter.write("\nPolicy:\n");
        ctx.presenter.write(`  Bundle: ${bundle.policy.bundle || "permit-all"}\n`);
        
        // Trace summary
        ctx.presenter.write("\nConfiguration Layers:\n");
        const layerCounts: Record<string, number> = {};
        for (const step of bundle.trace) {
          layerCounts[step.layer] = (layerCounts[step.layer] || 0) + 1;
        }
        for (const [layer, count] of Object.entries(layerCounts)) {
          ctx.presenter.write(`  ${layer}: ${count} setting(s)\n`);
        }
      }

      return 0;
    } catch (error: any) {
      // Handle specific error codes
      let exitCode = 1;
      
      if (error.code === 'ERR_FORBIDDEN') {
        exitCode = 3;
      } else if (error.code === 'ERR_CONFIG_NOT_FOUND') {
        exitCode = 2;
      } else if (error.code?.startsWith('ERR_')) {
        exitCode = 1;
      }

      if (json) {
        const errorResult = {
          schemaVersion: "1.0",
          ok: false,
          error: {
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message,
            hint: error.hint
          }
        };
        ctx.presenter.json(errorResult);
      } else {
        ctx.presenter.error(`❌ ${error.message}\n`);
        if (error.hint) {
          ctx.presenter.error(`   Hint: ${error.hint}\n`);
        }
      }

      return exitCode;
    }
  }
};
