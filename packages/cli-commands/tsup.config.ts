import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  entry: { index: "src/index.ts" },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  clean: false,
  // TODO: DTS disabled due to massive tech debt - ~50 commands define result types
  // with 'status' field that conflicts with CommandResult.status (CommandStatus).
  // Need to rename all custom 'status' fields to domain-specific names
  // (e.g., approvalStatus, budgetStatus, workerStatus) before re-enabling.
  dts: true,
});
