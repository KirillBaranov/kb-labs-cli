import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';
import { readFileSync } from 'node:fs';

// Read package.json at build time
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  ...nodePreset,
  entry: {
    index: "src/index.ts",
  },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  dts: true, // generate types for exports
  // Inject version at build time to avoid runtime require('../package.json')
  define: {
    '__CLI_API_VERSION__': JSON.stringify(pkg.version),
  },
  // nodePreset already includes all @kb-labs packages as external
});

