import type { CommandGroup } from '../../types'
import { wfRun } from './run'
import { wfValidate } from './validate'
import { wfRunsList } from './runs-list'
import { wfRunsGet } from './runs-get'
import { wfLogs } from './logs'
import { wfCancel } from './cancel'
import { wfWorker } from './worker'

export const workflowCommandGroup: CommandGroup = {
  name: 'wf',
  describe: 'Workflow engine commands',
  commands: [
    wfRun,
    wfValidate,
    wfRunsList,
    wfRunsGet,
    wfLogs,
    wfCancel,
    wfWorker,
  ],
}

export {
  wfRun,
  wfValidate,
  wfRunsList,
  wfRunsGet,
  wfLogs,
  wfCancel,
  wfWorker,
}


