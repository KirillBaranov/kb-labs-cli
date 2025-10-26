import type { Command } from "../../types";
import { explainBundle, ProductId } from '@kb-labs/core-bundle';
import { box, keyValue, formatTiming, TimingTracker } from '@kb-labs/shared-cli-ui';

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
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
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
      tracker.checkpoint('explain');
      
      // Get configuration trace
      const trace = await explainBundle({
        cwd: process.cwd(),
        product: product as ProductId,
        profileKey: profile as string
      });

      const totalTime = tracker.total();

      // Display trace
      ctx.presenter.write("🔍 Configuration Resolution Trace\n\n");
      
      if (trace.length === 0) {
        ctx.presenter.write("No configuration layers found.\n");
        
        if (jsonMode) {
          return { 
            ok: true, 
            product, 
            profile, 
            layers: 0, 
            settings: 0,
            timing: totalTime
          };
        } else {
          const summary = keyValue({
            'Product': product,
            'Profile': profile,
            'Layers': 0,
            'Settings': 0,
          });

          const output = box('Bundle Explain', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
          ctx.presenter.write(output);
        }
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

      // Add summary box at the end
      const totalSettings = trace.length;
      const totalLayers = Object.keys(layers).length;
      
      if (jsonMode) {
        return { 
          ok: true, 
          product, 
          profile, 
          layers: totalLayers, 
          settings: totalSettings,
          timing: totalTime
        };
      } else {
        const summary = keyValue({
          'Product': product,
          'Profile': profile,
          'Layers': totalLayers,
          'Settings': totalSettings,
        });

        const output = box('Bundle Explain', [...summary, '', `Time: ${formatTiming(totalTime)}`]);
        ctx.presenter.write(output);
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

      const errorMessage = error.message || 'Unknown error';
      
      if (jsonMode) {
        return { 
          ok: false, 
          error: errorMessage, 
          hint: error.hint,
          timing: tracker.total()
        };
      } else {
        ctx.presenter.error(`❌ ${errorMessage}\n`);
        if (error.hint) {
          ctx.presenter.error(`   Hint: ${error.hint}\n`);
        }
      }

      return exitCode;
    }
  }
};
