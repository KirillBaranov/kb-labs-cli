import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: {
    index: "src/index.ts",
    public: "src/public/index.ts",
  },
  external: ["@kb-labs/core-cli"],
  clean: true,
};
