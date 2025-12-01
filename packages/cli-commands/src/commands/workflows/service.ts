import type { EngineLogger } from '@kb-labs/workflow-engine'
import type { WorkflowWorker } from '@kb-labs/workflow-engine'
import {
  WorkflowService,
  type WorkflowRunParams,
  type WorkflowRunsListOptions as ApiWorkflowRunsListOptions,
  type WorkflowRunsListResult,
  type WorkflowLogEvent,
  type WorkflowLogStreamOptions as ApiWorkflowLogStreamOptions,
  type WorkflowWorkerOptions,
} from '@kb-labs/cli-api'

export interface RunWorkflowOptions extends WorkflowRunParams {
  logger: EngineLogger
}

export interface ListWorkflowRunsOptions
  extends ApiWorkflowRunsListOptions {
  logger?: EngineLogger
}

export interface StreamWorkflowLogsOptions
  extends ApiWorkflowLogStreamOptions {
  logger: EngineLogger
}

export type { WorkflowLogEvent }
export type ListRunsResult = WorkflowRunsListResult

export async function runWorkflow(options: RunWorkflowOptions) {
  const { logger, ...rest } = options
  const service = new WorkflowService(logger)
  return service.runWorkflow(rest)
}

export async function listWorkflowRuns(
  options: ListWorkflowRunsOptions = {},
): Promise<ListRunsResult> {
  const logger = options.logger ?? createNoopLogger()
  const { logger: _unused, ...rest } = options
  const service = new WorkflowService(logger)
  return service.listWorkflowRuns(rest)
}

export async function getWorkflowRun(
  runId: string,
  logger: EngineLogger,
) {
  const service = new WorkflowService(logger)
  return service.getWorkflowRun(runId)
}

export async function cancelWorkflowRun(
  runId: string,
  logger: EngineLogger,
) {
  const service = new WorkflowService(logger)
  return service.cancelWorkflowRun(runId)
}

export async function streamWorkflowLogs(
  options: StreamWorkflowLogsOptions,
) {
  const { logger, ...rest } = options
  const service = new WorkflowService(logger)
  await service.streamWorkflowLogs(rest)
}

export interface WorkflowWorkerStartOptions extends WorkflowWorkerOptions {
  logger: EngineLogger
}

export async function startWorkflowWorker(
  options: WorkflowWorkerStartOptions,
): Promise<WorkflowWorker> {
  const { logger, ...rest } = options
  const service = new WorkflowService(logger)
  const worker = await service.createWorker(rest)
  worker.start()
  return worker
}

function createNoopLogger(): EngineLogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
}

