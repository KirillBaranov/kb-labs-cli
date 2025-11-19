import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit'
import { resolveWorkflowSpec } from './utils'
import {
  TimingTracker,
  box,
  keyValue,
  formatTiming,
} from '@kb-labs/shared-cli-ui'
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit'

type WorkflowValidateResult = CommandResult & {
  source?: string;
  spec?: any;
};

type WfValidateFlags = {
  file: { type: 'string'; description?: string };
  inline: { type: 'string'; description?: string };
  stdin: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfValidate = defineSystemCommand<WfValidateFlags, WorkflowValidateResult>({
  name: 'validate',
  description: 'Validate a workflow specification (YAML or JSON)',
  category: 'workflows',
  aliases: ['wf:validate'],
  flags: {
    file: { type: 'string', description: 'Path to workflow specification file' },
    inline: { type: 'string', description: 'Inline workflow specification (JSON or YAML)' },
    stdin: { type: 'boolean', description: 'Read workflow specification from STDIN' },
    json: { type: 'boolean', description: 'Output validation result as JSON' },
    verbose: { type: 'boolean', description: 'Print verbose logs' },
  },
  examples: [
    'kb wf validate --file ./kb.workflow.yml',
    "kb wf validate --inline '{\"name\":\"demo\",\"on\":{\"manual\":true},\"jobs\":{}}'",
    'cat kb.workflow.yml | kb wf validate --stdin',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const jsonMode = Boolean(flags.json)
    const tracker = new TimingTracker()
    const output = ctx.output;
    const logger = ctx.logger;

    try {
      tracker.checkpoint('start')
      const result = await resolveWorkflowSpec(ctx, flags as any, 'kb.workflow.yml')
      tracker.checkpoint('validate')

      logger?.info('Workflow validated successfully', {
        source: result.source,
        name: result.spec.name,
        durationMs: tracker.total(),
      });

      if (jsonMode) {
        output?.json({
          ok: true,
          source: result.source,
          spec: result.spec,
          timingMs: tracker.total(),
        })
        return { ok: true, source: result.source, spec: result.spec }
      }

      const summaryLines: string[] = [
        ...keyValue({
          Source: result.source,
          Name: result.spec.name,
          Version: result.spec.version,
        }),
      ]

      summaryLines.push('')
      summaryLines.push(
        `${output?.ui.symbols.success ?? '✓'} ${output?.ui.colors.success('Workflow specification is valid') ?? 'Workflow specification is valid'} · ${output?.ui.colors.muted(formatTiming(tracker.total())) ?? formatTiming(tracker.total())}`,
      )

      output?.write('\n' + box('Workflow Validation', summaryLines))
      return { ok: true, source: result.source, spec: result.spec }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      
      logger?.error('Workflow validation failed', {
        error: message,
        durationMs: tracker.total(),
      });
      
      if (jsonMode) {
        output?.json({
          ok: false,
          error: message,
          timingMs: tracker.total(),
        })
      } else {
        const summaryLines: string[] = [
          output?.ui.colors.error(message) ?? message,
          '',
          `${output?.ui.symbols.error ?? '✗'} ${output?.ui.colors.error('Validation failed') ?? 'Validation failed'} · ${output?.ui.colors.muted(formatTiming(tracker.total())) ?? formatTiming(tracker.total())}`,
        ]
        output?.write('\n' + box('Workflow Validation', summaryLines))
      }
      return { ok: false, error: message }
    }
  },
})
