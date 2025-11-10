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
    "@kb-labs/cli-runtime",
    "@kb-labs/cli-commands",
    "@kb-labs/shared-cli-ui",
    "@kb-labs/plugin-adapter-cli",
    "@kb-labs/plugin-adapter-rest",
    "@kb-labs/core-sys",
  ],
  esbuildOptions(options) {
    options.external = [
      ...(options.external ?? []),
      "@kb-labs/cli-core",
      "@kb-labs/cli-core/public",
      "@kb-labs/cli-runtime",
      "@kb-labs/cli-commands",
      "@kb-labs/shared-cli-ui",
      "@kb-labs/plugin-adapter-cli",
      "@kb-labs/plugin-adapter-rest",
      "@kb-labs/core-sys",
    ];
  },
  dts: {
    resolve: false,
  },
  skipNodeModulesBundle: true,
  clean: false,
};
