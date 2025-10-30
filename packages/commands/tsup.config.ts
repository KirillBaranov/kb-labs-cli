import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: { index: "src/index.ts" },
  dts: { resolve: false },
  clean: false,
  skipNodeModulesBundle: true,
};
