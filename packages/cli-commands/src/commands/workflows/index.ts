import type { CommandGroup } from '../../types'
// import { wfRun } from './run' // LEGACY - missing exports
import { wfValidate } from './validate'
import { wfRunsList } from './runs-list'
import { wfRunsGet } from './runs-get'
import { wfLogs } from './logs'
import { wfCancel } from './cancel'
import { wfList } from './list'
import { wfInit } from './init'
// import { wfApprove } from './approve' // LEGACY - missing exports
import { wfReplay } from './replay'
import {
  wfMarketplaceAdd,
  wfMarketplaceList,
  wfMarketplaceRemove,
  wfMarketplaceUpdate,
} from './marketplace'
// import { wfBudgetStatus } from './budget' // LEGACY - missing exports

export const workflowCommandGroup: CommandGroup = {
  name: 'workflow',
  aliases: ['wf'],
  describe: 'Workflow engine commands',
  commands: [
    wfList,
    wfInit,
    // wfRun, // LEGACY - missing exports
    wfValidate,
    wfRunsList,
    wfRunsGet,
    wfLogs,
    wfCancel,
    // wfApprove, // LEGACY - missing exports
    wfReplay,
    wfMarketplaceAdd,
    wfMarketplaceList,
    wfMarketplaceRemove,
    wfMarketplaceUpdate,
    // wfBudgetStatus, // LEGACY - missing exports
    // wfWorker removed - obsolete in V3
  ],
}

export {
  wfList,
  wfInit,
  // wfRun, // LEGACY
  wfValidate,
  wfRunsList,
  wfRunsGet,
  wfLogs,
  wfCancel,
  // wfApprove, // LEGACY
  wfReplay,
  wfMarketplaceAdd,
  wfMarketplaceList,
  wfMarketplaceRemove,
  wfMarketplaceUpdate,
  // wfBudgetStatus, // LEGACY
}


