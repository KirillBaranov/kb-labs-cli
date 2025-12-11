import { defineConfig } from 'tsup';
import binPreset from '@kb-labs/devkit/tsup/bin.js';

export default defineConfig({
  ...binPreset,
  sourcemap: false, // Temporary: disable sourcemaps to avoid rollup conflicts
  tsconfig: "tsconfig.build.json",
  entry: {
    bin: 'src/bin.ts',
  },
  // 🧪 EXPERIMENT: Bundle core-runtime instead of externalizing it
  // Testing if singleton pattern still works when core-runtime is bundled.
  // Singleton should work because child processes use IPC/Unix Socket transport,
  // not direct code sharing. If this works, it eliminates the need for workspace symlinks.
  external: [
    ...binPreset.external ?? [],
    // Only externalize core-sandbox (still needed for isolation)
    '@kb-labs/core-sandbox',
  ],
});
