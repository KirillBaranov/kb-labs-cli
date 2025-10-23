import type { CommandGroup } from "../../types";
import { print } from './print.js';
import { explain } from './explain.js';

export const bundleGroup: CommandGroup = {
  name: "bundle",
  describe: "Bundle configuration management",
  commands: [print, explain]
};

// Back-compat re-exports
export { print as bundlePrint, explain as bundleExplain };
