import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: { index: "src/index.ts" },
  dts: { resolve: true },
  clean: false,
  skipNodeModulesBundle: true,
  external: [
    "@kb-labs/cli-core",
    "@kb-labs/core-cli-adapters",
    "@kb-labs/plugin-adapter-cli",
    "@kb-labs/plugin-adapter-rest",
    "@kb-labs/plugin-adapter-studio",
  ],
  esbuildOptions(options) {
    options.external = [
      "@kb-labs/cli-core",
      "@kb-labs/core-cli-adapters",
      "@kb-labs/plugin-adapter-cli",
      "@kb-labs/plugin-adapter-rest",
      "@kb-labs/plugin-adapter-studio",
    ];
  },
};
