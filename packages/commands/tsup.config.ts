import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: { index: "src/index.ts" },
  clean: false,
  skipNodeModulesBundle: true,
};
