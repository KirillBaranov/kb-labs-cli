import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  external: [
    "@kb-labs/cli-core",
    "@kb-labs/cli-core/public",
    "@kb-labs/cli-commands",
    "@kb-labs/core-cli-adapters",
    "@kb-labs/shared-cli-ui",
    "@kb-labs/plugin-adapter-cli",
  ],
  esbuildOptions(options) {
    options.external = [
      "@kb-labs/cli-core",
      "@kb-labs/cli-core/public",
      "@kb-labs/cli-commands",
      "@kb-labs/core-cli-adapters",
      "@kb-labs/shared-cli-ui",
      "@kb-labs/plugin-adapter-cli",
    ];
  },
  dts: {
    resolve: false,
  },
  skipNodeModulesBundle: true,
  clean: false,
};
