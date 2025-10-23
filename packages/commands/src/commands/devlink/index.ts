import type { CommandGroup } from "../../types";
import { plan } from './plan';
import { apply } from './apply';
import { freeze } from './freeze';
import { lockApply } from './lock-apply';
import { undo } from './undo';
import { status } from './status';
import { about } from './about';
import { backups } from './backups';
import { watch } from './watch';

export const devlinkGroup: CommandGroup = {
  name: "devlink",
  describe: "Workspace linking and dependency management",
  commands: [plan, apply, freeze, lockApply, undo, status, backups, about, watch]
};

// Back-compat re-exports (so external imports won't break)
export { plan as devlinkPlan, apply as devlinkApply, freeze as devlinkFreeze, lockApply as devlinkLockApply, undo as devlinkUndo, status as devlinkStatus, backups as devlinkBackups, about as devlinkAbout, watch as devlinkWatch };
