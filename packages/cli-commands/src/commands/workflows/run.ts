import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit'
import { TimingTracker, box } from '@kb-labs/shared-cli-ui'
import { createCliEngineLogger, resolveWorkflowSpec, formatRunHeader, statusBadge } from './utils'
import { runWorkflow } from './service'
import { createWorkflowRegistry } from '@kb-labs/workflow-runtime'
import { WorkflowLoader } from '@kb-labs/workflow-engine'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'
import type { WorkflowRun } from '@kb-labs/workflow-contracts'

type WorkflowRunResult = CommandResult & {
  run?: WorkflowRun;
};

type WfRunFlags = {
  'workflow-id': { type: 'string'; description?: string };
  file: { type: 'string'; description?: string };
  inline: { type: 'string'; description?: string };
  stdin: { type: 'boolean'; description?: string };
  'spec-ref': { type: 'string'; description?: string };
  idempotency: { type: 'string'; description?: string };
  'concurrency-group': { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfRun = defineSystemCommand<WfRunFlags, WorkflowRunResult>({
  name: 'run',
  description: 'Execute a workflow specification',
  category: 'workflows',
  aliases: ['wf:run'],
  flags: {
    'workflow-id': { type: 'string', description: 'Workflow ID from registry (e.g. workspace:ai-ci)' },
    file: { type: 'string', description: 'Path to workflow specification file' },
    inline: { type: 'string', description: 'Inline workflow specification (JSON or YAML)' },
    stdin: { type: 'boolean', description: 'Read workflow spec from STDIN' },
    'spec-ref': { type: 'string', description: 'Specification reference (registry/location)' },
    idempotency: { type: 'string', description: 'Idempotency key for the workflow run' },
    'concurrency-group': { type: 'string', description: 'Concurrency group identifier' },
    json: { type: 'boolean', description: 'Output run details as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf run --workflow-id workspace:ai-ci',
    'kb wf run --file ./kb.workflow.yml',
    'kb wf run --inline "{\\"name\\":\\"demo\\",\\"on\\":{\\"manual\\":true},\\"jobs\\":{}}"',
    'cat kb.workflow.yml | kb wf run --stdin --idempotency run-123',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
    const tracker = new TimingTracker()

    try {
      let result: { spec: any; source: string }

      // Приоритет: --workflow-id > --file > --inline > --stdin > default
      if (flags['workflow-id']) {
        const workflowId = flags['workflow-id']
        const registry = await createWorkflowRegistry({
          workspaceRoot: process.cwd(),
        })
        const resolved = await registry.resolve(workflowId)

        if (!resolved) {
          const message = `Workflow '${workflowId}' not found`
          if (jsonMode) {
            ctx.output?.json({ ok: false, error: message })
          } else {
            ctx.output?.error(message)
          }
          return { ok: false, error: message }
        }

        // Load from resolved path
        const loader = new WorkflowLoader(logger)
        const loaderResult = await loader.fromFile(resolved.filePath)
        result = {
          spec: loaderResult.spec,
          source: `registry:${resolved.id}`,
        }
      } else {
        result = await resolveWorkflowSpec(ctx, flags as any, 'kb.workflow.yml')
      }

      tracker.checkpoint('spec')
      const run = await runWorkflow({
        spec: result.spec,
        idempotencyKey: flags.idempotency,
        concurrencyGroup: flags['concurrency-group'],
        logger,
        metadata: {
          source: result.source,
          invokedFrom: 'cli',
        },
      })
      tracker.checkpoint('run')

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          run,
          timing: tracker.breakdown(),
        })
        return { ok: true, run }
      }

      const summaryLines: string[] = [
        ...formatRunHeader(run, tracker.total()),
      ]

      for (const job of run.jobs) {
        summaryLines.push(
          `${statusBadge(job.status)} ${job.jobName} (${job.steps.length} steps)`,
        )
      }

      ctx.output?.write('\n' + box('Workflow Run', summaryLines))
      return { ok: true, run }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Workflow run failed: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})


