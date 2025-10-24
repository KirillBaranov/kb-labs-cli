import type { Command } from "../../types";
import { explainBundle, ProductId } from '@kb-labs/core-bundle';

export const explain: Command = {
  name: "explain",
  category: "bundle",
  describe: "Explain bundle configuration resolution",
  longDescription: "Shows how bundle configuration is resolved layer by layer",
  aliases: ["bundle:explain"],
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
    }
  ],
  examples: [
    "kb bundle explain --product=aiReview",
    "kb bundle explain --product=aiReview --profile=production"
  ],

  async run(ctx, argv, flags) {
    const defaultFlags = {
      product: undefined as string | undefined,
      profile: "default",
    };

    // Merge with provided flags
    const finalFlags = { ...defaultFlags, ...flags };
    const { product, profile } = finalFlags;

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
      // Get configuration trace
      const trace = await explainBundle({
        cwd: process.cwd(),
        product: product as ProductId,
        profileKey: profile as string
      });

      // Display trace
      ctx.presenter.write("🔍 Configuration Resolution Trace\n\n");
      
      if (trace.length === 0) {
        ctx.presenter.write("No configuration layers found.\n");
        return 0;
      }

      // Group by layer
      const layers: Record<string, Array<typeof trace[0]>> = {};
      for (const step of trace) {
        if (!layers[step.layer]) {
          layers[step.layer] = [];
        }
        layers[step.layer]!.push(step);
      }

      // Display each layer
      for (const [layerName, steps] of Object.entries(layers)) {
        ctx.presenter.write(`📋 ${layerName.toUpperCase()} Layer (${steps.length} setting(s))\n`);
        
        for (const step of steps) {
          const source = step.source || 'unknown';
          const type = step.type === 'overwriteArray' ? 'array overwrite' : 'set';
          
          ctx.presenter.write(`  ${step.path} = ${source} (${type})\n`);
          
          // Show additional context if available
          if (step.profileKey) {
            ctx.presenter.write(`    Profile: ${step.profileKey}\n`);
          }
          if (step.profileRef) {
            ctx.presenter.write(`    Profile Ref: ${step.profileRef}\n`);
          }
          if (step.presetRef) {
            ctx.presenter.write(`    Preset: ${step.presetRef}\n`);
          }
          if (step.version) {
            ctx.presenter.write(`    Version: ${step.version}\n`);
          }
        }
        
        ctx.presenter.write("\n");
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

      ctx.presenter.error(`❌ ${error.message}\n`);
      if (error.hint) {
        ctx.presenter.error(`   Hint: ${error.hint}\n`);
      }

      return exitCode;
    }
  }
};
