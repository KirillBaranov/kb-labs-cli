import { defineConfig } from "vitest/config";
import { resolve } from "path";
import nodePreset from "@kb-labs/devkit/vitest/node.js";

export default defineConfig({
  ...nodePreset,
  resolve: {
    alias: {
      "@kb-labs/cli-core": resolve(__dirname, "./packages/core/src"),
      "@kb-labs/cli-adapters": resolve(__dirname, "./packages/adapters/src"),
      "@kb-labs/cli-commands": resolve(__dirname, "./packages/commands/src"),
      "@kb-labs/cli-runtime": resolve(__dirname, "./packages/cli-runtime/src"),
      "@kb-labs/cli-api": resolve(__dirname, "./packages/cli-api/src"),
      "@kb-labs/shared-cli-ui": resolve(
        __dirname,
        "../kb-labs-shared/packages/cli-ui/src",
      ),
      "@kb-labs/plugin-adapter-cli": resolve(__dirname, "../kb-labs-plugin/packages/adapters/cli/src"),
      "@kb-labs/plugin-adapter-rest": resolve(__dirname, "../kb-labs-plugin/packages/adapters/rest/src"),
    },
  },
  test: {
    ...nodePreset.test,
    include: ["packages/**/src/**/*.spec.ts", "packages/**/src/**/*.test.ts"],
    setupFiles: [
      ...(nodePreset.test?.setupFiles ?? []),
      resolve(__dirname, "./vitest.setup.ts"),
    ],
    coverage: {
      ...nodePreset.test?.coverage,
      enabled: true,
      exclude: [
        "**/dist/**",
        "**/fixtures/**",
        "**/__tests__/**",
        "**/*.spec.*",
        "**/*.test.*",
        // non-source and config files
        "eslint.config.js",
        "**/vitest.config.ts",
        "**/tsup.config.ts",
        "**/tsconfig*.json",
        "apps/**",
        // barrel files / types
        "**/index.ts",
        "**/types.ts",
        "**/types/**",
        // devkit scripts
        "scripts/devkit-sync.mjs",
        // CLI bin files (executable entry points)
        "**/bin.ts",
        "**/bin.js",
        // test files and directories
        "**/tests/**",
        "**/test/**",
      ],
    },
  },
});
