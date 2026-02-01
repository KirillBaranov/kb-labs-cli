/**
 * @module @kb-labs/cli-commands/workflows/service
 * Workflow service adapter for commands (V3)
 * Direct usage of WorkflowEngine - following plugins pattern
 */

import { WorkflowEngine } from '@kb-labs/workflow-engine';
import { platform } from '@kb-labs/core-runtime';
import type { WorkflowRun, WorkflowSpec } from '@kb-labs/workflow-contracts';

/**
 * Event handler for workflow logs
 */
export type WorkflowLogEventHandler = (event: WorkflowLogEvent) => void;

/**
 * Workflow log event
 */
export interface WorkflowLogEvent {
  id: string;
  type: string;
  timestamp: string;
  runId: string;
  jobId?: string;
  stepId?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  payload?: unknown;
}

/**
 * Options for running a workflow
 */
export interface RunWorkflowOptions {
  idempotencyKey?: string;
  concurrencyGroup?: string;
  metadata?: Record<string, unknown>;
  trigger?: WorkflowRun['trigger'];
}

/**
 * Options for listing workflow runs
 */
export interface ListRunsOptions {
  status?: string;
  limit?: number;
}

/**
 * Create workflow engine instance with platform adapters
 */
function createWorkflowEngine(): WorkflowEngine {
  return new WorkflowEngine({
    cache: platform.cache,
    events: platform.eventBus,
    logger: platform.logger,
    // executionBackend not compatible with V3 yet
  });
}

/**
 * Run a workflow from spec
 */
export async function runWorkflow(
  spec: WorkflowSpec,
  options: RunWorkflowOptions = {}
): Promise<WorkflowRun> {
  const engine = createWorkflowEngine();
  try {
    return await engine.runFromSpec(spec, {
      trigger: options.trigger ?? createDefaultTrigger(),
      idempotencyKey: options.idempotencyKey,
      concurrencyGroup: options.concurrencyGroup,
      metadata: options.metadata,
    });
  } finally {
    await engine.dispose();
  }
}

/**
 * Get workflow run by ID
 */
export async function getWorkflowRun(runId: string): Promise<WorkflowRun | null> {
  const engine = createWorkflowEngine();
  try {
    return await engine.getRun(runId);
  } finally {
    await engine.dispose();
  }
}

/**
 * List workflow runs using sorted set index
 */
export async function listWorkflowRuns(
  options: ListRunsOptions = {}
): Promise<WorkflowRun[]> {
  const cache = platform.cache;
  const limit = options.limit ?? 100;
  const now = Date.now();

  // Get run IDs from sorted set (sorted by timestamp)
  const runIds = await cache.zrangebyscore('workflow:runs:index', 0, now);

  // Limit results
  const limitedIds = runIds.slice(-limit).reverse();

  // Fetch runs in parallel
  const runs = await Promise.all(
    limitedIds.map((id) => cache.get<WorkflowRun>(`kb:run:${id}`))
  );

  // Filter out nulls and apply status filter if provided
  let results = runs.filter((run): run is WorkflowRun => run !== null);

  if (options.status) {
    results = results.filter((run) => run.status === options.status);
  }

  return results;
}

/**
 * Cancel workflow run
 */
export async function cancelWorkflowRun(runId: string): Promise<void> {
  const engine = createWorkflowEngine();
  try {
    await engine.cancelRun(runId);
  } finally {
    await engine.dispose();
  }
}

/**
 * Stream workflow logs using event subscription
 */
export async function streamWorkflowLogs(
  runId: string,
  onEvent: WorkflowLogEventHandler,
  signal?: AbortSignal
): Promise<void> {
  const events = platform.eventBus;

  // Subscribe to workflow log events
  const unsubscribe = events.subscribe(
    `workflow.run.${runId}.log`,
    async (event: any) => {
      const logEvent: WorkflowLogEvent = {
        id: event.id ?? '',
        type: event.type ?? 'unknown',
        timestamp: event.timestamp ?? new Date().toISOString(),
        runId,
        jobId: event.meta?.jobId,
        stepId: event.meta?.stepId,
        level: event.meta?.level ?? 'info',
        message: event.payload?.message,
        payload: event.payload,
      };
      onEvent(logEvent);
    }
  );

  // Keep listening until aborted or run completes
  const checkInterval = 1000; // Check every second

  try {
    while (!signal?.aborted) {
      const run = await getWorkflowRun(runId);

      if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) {
        break;
      }

      await sleep(checkInterval);
    }
  } finally {
    // Cleanup subscription
    unsubscribe();
  }
}

/**
 * Create default trigger for manual CLI execution
 */
function createDefaultTrigger(): WorkflowRun['trigger'] {
  return {
    type: 'manual',
    actor: process.env.KB_USER ?? process.env.USER ?? 'cli',
    payload: { source: 'cli' },
  };
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// Workflow Management (V3)
// Using WorkflowService for unified workflow access
// ============================================================================

import { WorkflowService, WorkflowRepository, ManifestScanner } from '@kb-labs/workflow-engine';
import { createCliAPI } from '@kb-labs/cli-api';
import type { WorkflowRuntime } from '@kb-labs/workflow-engine';

let _workflowService: WorkflowService | null = null;

/**
 * Get or create WorkflowService instance
 */
async function getWorkflowService(): Promise<WorkflowService> {
  if (_workflowService) {
    return _workflowService;
  }

  // Create CliAPI for manifest scanning
  const cliApi = await createCliAPI({ cache: { inMemory: true, ttlMs: 10_000 } });

  const repository = new WorkflowRepository(platform, '.kb/workflows');
  const scanner = new ManifestScanner(cliApi, platform);

  _workflowService = new WorkflowService(scanner, repository, platform);
  return _workflowService;
}

export interface ListWorkflowsOptions {
  source?: 'manifest' | 'standalone';
  status?: 'active' | 'paused' | 'disabled';
  tags?: string[];
  search?: string;
}

/**
 * List all workflows (manifest + standalone)
 */
export async function listWorkflows(options: ListWorkflowsOptions = {}): Promise<WorkflowRuntime[]> {
  const service = await getWorkflowService();

  let workflows = await service.listAll({
    source: options.source,
    status: options.status,
  });

  // Apply additional filters
  if (options.tags && options.tags.length > 0) {
    workflows = workflows.filter((w) => w.tags?.some((tag) => options.tags!.includes(tag)));
  }

  if (options.search) {
    const search = options.search.toLowerCase();
    workflows = workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(search) ||
        w.description?.toLowerCase().includes(search)
    );
  }

  return workflows;
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(id: string): Promise<WorkflowRuntime | null> {
  const service = await getWorkflowService();
  return service.get(id);
}
