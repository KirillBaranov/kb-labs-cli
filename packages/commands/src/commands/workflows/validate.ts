import type { Command } from '../../types'
import { resolveWorkflowSpec } from './utils'
import {
  TimingTracker,
  box,
  keyValue,
  safeColors,
  safeSymbols,
  formatTiming,
} from '@kb-labs/shared-cli-ui'

interface Flags {
  file?: string
  inline?: string
  stdin?: boolean
  json?: boolean
  verbose?: boolean
}

export const wfValidate: Command = {
  name: 'validate',
  describe: 'Validate a workflow specification (YAML or JSON)',
  category: 'workflows',
  aliases: ['wf:validate'],
  flags: [
    {
      name: 'file',
      type: 'string',
      description: 'Path to workflow specification file',
    },
    {
      name: 'inline',
      type: 'string',
      description: 'Inline workflow specification (JSON or YAML)',
    },
    {
      name: 'stdin',
      type: 'boolean',
      description: 'Read workflow specification from STDIN',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output validation result as JSON',
    },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Print verbose logs',
    },
  ],
  examples: [
    'kb wf validate --file ./kb.workflow.yml',
    "kb wf validate --inline '{\"name\":\"demo\",\"on\":{\"manual\":true},\"jobs\":{}}'",
    'cat kb.workflow.yml | kb wf validate --stdin',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const tracker = new TimingTracker()

    try {
      tracker.checkpoint('start')
      const result = await resolveWorkflowSpec(ctx, flags, 'kb.workflow.yml')
      tracker.checkpoint('validate')

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          source: result.source,
          spec: result.spec,
          timingMs: tracker.total(),
        })
        return 0
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
        `${safeSymbols.success} ${safeColors.success('Workflow specification is valid')} · ${safeColors.muted(formatTiming(tracker.total()))}`,
      )

      ctx.presenter.write('\n' + box('Workflow Validation', summaryLines))
      return 0
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({
          ok: false,
          error: message,
          timingMs: tracker.total(),
        })
      } else {
        const summaryLines: string[] = [
          safeColors.error(message),
          '',
          `${safeSymbols.error} ${safeColors.error('Validation failed')} · ${safeColors.muted(formatTiming(tracker.total()))}`,
        ]
        ctx.presenter.write('\n' + box('Workflow Validation', summaryLines))
      }
      return 1
    }
  },
}
