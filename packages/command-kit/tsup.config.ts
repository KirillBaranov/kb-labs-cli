import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
    'flags/index': 'src/flags/index.ts',
    'analytics/index': 'src/analytics/index.ts',
    'errors/index': 'src/errors/index.ts',
    'helpers/index': 'src/helpers/index.ts',
  },
  tsconfig: 'tsconfig.build.json', // Use build-specific tsconfig without paths
  dts: false, // Disabled temporarily - needs @kb-labs/analytics-sdk-node package (unrelated to circular deps)
});

