import { defineConfig } from 'tsup';
import dualPreset from '@kb-labs/devkit/tsup/dual';

export default defineConfig({
  ...dualPreset,
  entry: {
    index: "src/index.ts",
    public: "src/public/index.ts",
    "v3/index": "src/v3/index.ts",
  },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  dts: true, // Re-enabled for V3 migration
});
