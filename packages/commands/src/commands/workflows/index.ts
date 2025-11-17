import type { CommandGroup } from '../../types'
import { wfRun } from './run'
import { wfValidate } from './validate'
import { wfRunsList } from './runs-list'
import { wfRunsGet } from './runs-get'
import { wfLogs } from './logs'
import { wfCancel } from './cancel'
import { wfWorker } from './worker'
import { wfList } from './list'
import { wfInit } from './init'
import { wfApprove } from './approve'
import { wfReplay } from './replay'
import {
  wfMarketplaceAdd,
  wfMarketplaceList,
  wfMarketplaceRemove,
  wfMarketplaceUpdate,
} from './marketplace'
import { wfBudgetStatus } from './budget'

export const workflowCommandGroup: CommandGroup = {
  name: 'wf',
  describe: 'Workflow engine commands',
  commands: [
    wfList,
    wfInit,
    wfRun,
    wfValidate,
    wfRunsList,
    wfRunsGet,
    wfLogs,
    wfCancel,
    wfApprove,
    wfReplay,
    wfMarketplaceAdd,
    wfMarketplaceList,
    wfMarketplaceRemove,
    wfMarketplaceUpdate,
    wfBudgetStatus,
    wfWorker,
  ],
}

export {
  wfList,
  wfInit,
  wfRun,
  wfValidate,
  wfRunsList,
  wfRunsGet,
  wfLogs,
  wfCancel,
  wfApprove,
  wfReplay,
  wfMarketplaceAdd,
  wfMarketplaceList,
  wfMarketplaceRemove,
  wfMarketplaceUpdate,
  wfBudgetStatus,
  wfWorker,
}


