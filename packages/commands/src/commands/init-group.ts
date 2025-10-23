/**
 * @module @kb-labs/cli-commands/init-group
 * Init command group registration
 */

import type { CommandGroup } from '../types';
import { initAll, initWorkspace, initProfile, initPolicy } from './init';

export const initGroup: CommandGroup = {
  name: 'init',
  describe: 'Initialize KB Labs workspace components',
  commands: [initAll, initWorkspace, initProfile, initPolicy],
};

