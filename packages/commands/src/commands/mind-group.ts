/**
 * Mind command group for KB Labs CLI
 */

import type { CommandGroup } from "../types";
import { mindInit, mindUpdate, mindPack, mindFeed } from "./mind";

export const mindGroup: CommandGroup = {
  name: "mind",
  description: "Mind context layer commands",
  commands: [
    mindInit,
    mindUpdate, 
    mindPack,
    mindFeed
  ]
};
