import { defineConfig } from 'tsup';
import binPreset from '@kb-labs/devkit/tsup/bin.js';

export default defineConfig({
  ...binPreset,
  sourcemap: false, // Temporary: disable sourcemaps to avoid rollup conflicts
  tsconfig: "tsconfig.build.json",
  entry: {
    bin: 'src/bin.ts',
  },
});
