import type { Command } from '../../types'
import { resolveWorkflowSpec } from './utils'

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

    try {
      const result = await resolveWorkflowSpec(ctx, flags, 'kb.workflow.yml')

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          source: result.source,
          spec: result.spec,
        })
        return 0
      }

      if (typeof ctx.presenter.success === 'function') {
        ctx.presenter.success('Workflow specification is valid')
      } else {
        ctx.presenter.info('Workflow specification is valid')
      }
      ctx.presenter.info(`Source: ${result.source}`)
      ctx.presenter.info(`Name: ${result.spec.name}`)
      ctx.presenter.info(`Version: ${result.spec.version}`)

      return 0
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({
          ok: false,
          error: message,
        })
      } else {
        ctx.presenter.error(`Validation failed: ${message}`)
      }
      return 1
    }
  },
}
