import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: "src/index.ts",
    public: "src/public/index.ts",
  },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  dts: false, // Temporarily disabled for debugging
});
