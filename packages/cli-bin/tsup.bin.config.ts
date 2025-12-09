import { defineConfig } from 'tsup';
import binPreset from '@kb-labs/devkit/tsup/bin.js';

export default defineConfig({
  ...binPreset,
  sourcemap: false, // Temporary: disable sourcemaps to avoid rollup conflicts
  tsconfig: "tsconfig.build.json",
  entry: {
    bin: 'src/bin.ts',
  },
  // ✅ CRITICAL: Override binPreset to make core-runtime/core-sandbox external
  // This is essential for platform singleton to work across CLI and sandbox processes.
  // Without this, each process gets its own copy of globalThis, breaking the singleton pattern.
  // Keep noExternal from binPreset (bundle everything), but override external list
  external: [
    ...binPreset.external ?? [],
    // Externalize ONLY core packages needed for singleton pattern
    '@kb-labs/core-runtime',
    '@kb-labs/core-sandbox',
  ],
  // Use esbuild plugin to force externalization (external config alone may not work with noExternal)
  esbuildPlugins: [
    ...(binPreset.esbuildPlugins ?? []),
    {
      name: 'force-external-core-runtime',
      setup(build) {
        build.onResolve({ filter: /^@kb-labs\/core-(runtime|sandbox)/ }, (args) => {
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
