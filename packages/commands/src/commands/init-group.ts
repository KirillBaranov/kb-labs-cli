/**
 * @module @kb-labs/cli-commands/init-group
 * Init command group registration
 */

import type { CommandGroup } from '../types';
import { setupAll, setupWorkspace, setupProfile, setupPolicy } from './init';

export const setupGroup: CommandGroup = {
  name: 'setup',
  describe: 'Setup KB Labs workspace components',
  commands: [setupAll, setupWorkspace, setupProfile, setupPolicy],
};

