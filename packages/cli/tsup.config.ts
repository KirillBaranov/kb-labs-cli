import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  dts: {
    resolve: false,
  },
  skipNodeModulesBundle: true,
  clean: false,
};
