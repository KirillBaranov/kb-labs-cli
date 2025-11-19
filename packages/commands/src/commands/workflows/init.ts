import type { Command } from '../../types'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { minimatch } from 'minimatch'
import {
  TimingTracker,
  box,
  keyValue,
  safeColors,
  safeSymbols,
  formatTiming,
} from '@kb-labs/shared-cli-ui'

const TEMPLATES = {
  'ai-ci-standard': `name: ai-ci-standard
version: 1.0.0
description: AI-powered CI workflow
on:
  push: true
  manual: true
jobs:
  verify:
    runsOn: local
    steps:
      - name: Mind Verify
        uses: plugin:@kb-labs/mind/cli/verify
      
      - name: AI Review
        id: review
        uses: plugin:@kb-labs/ai-review/cli/run
      
      - name: AI Tests
        uses: plugin:@kb-labs/ai-tests/cli/generate
        if: \${{ steps.review.outputs.risk == 'high' }}
`,
  'nested-workflow': `name: nested-workflow-example
version: 1.0.0
description: Example of nested workflows
on:
  manual: true
jobs:
  orchestration:
    runsOn: local
    steps:
      - name: Run Full Audit
        id: audit
        uses: workflow:plugin:@kb-labs/ai-review/full-audit
      
      - name: Run Release
        uses: workflow:plugin:@kb-labs/release-manager/standard-release
        if: \${{ steps.audit.outputs.status == 'success' }}
`,
  'empty': `name: my-workflow
version: 1.0.0
description: TODO
on:
  manual: true
jobs:
  main:
    runsOn: local
    steps:
      - name: Example Step
        uses: builtin:shell
        with:
          command: echo "Hello World"
`,
}

async function readJSON(filePath: string): Promise<any> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

interface Flags {
  id?: string
  template?: string
  dir?: string
}

export const wfInit: Command = {
  name: 'init',
  describe: 'Initialize a new workflow',
  category: 'workflows',
  aliases: ['wf:init'],
  flags: [
    { name: 'id', type: 'string', description: 'Workflow ID (filename without extension)' },
    { name: 'template', type: 'string', description: 'Template to use', choices: Object.keys(TEMPLATES) },
    { name: 'dir', type: 'string', description: 'Output directory', default: '.kb/workflows' },
  ],
  examples: [
    'kb wf init --id my-workflow --template empty',
    'kb wf init --id ai-ci --template ai-ci-standard',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const tracker = new TimingTracker()

    try {
      tracker.checkpoint('start')
      // Validate required flags
      if (!flags.id || !flags.template) {
        ctx.presenter.error('Both --id and --template are required. Use --help for examples.')
        return 1
      }

      // Validate template
      if (!(flags.template in TEMPLATES)) {
        ctx.presenter.error(`Invalid template: ${flags.template}. Available: ${Object.keys(TEMPLATES).join(', ')}`)
        return 1
      }

      // Validate ID format
      if (!/^[a-z0-9-]+$/.test(flags.id)) {
        ctx.presenter.error('Workflow ID must contain only lowercase letters, numbers, and hyphens')
        return 1
      }

      const id = flags.id
      const template = flags.template
      const dir = flags.dir ?? '.kb/workflows'
      const workspaceRoot = ctx.workspaceRoot ?? process.cwd()

      // 2. Create file
      const filePath = join(workspaceRoot, dir, `${id}.yml`)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, TEMPLATES[template as keyof typeof TEMPLATES], 'utf-8')

      // 3. Check kb.config.json if needed
      const configPath = join(workspaceRoot, 'kb.config.json')
      let config: any = {}
      try {
        const configContent = await readFile(configPath, 'utf-8')
        config = JSON.parse(configContent)
      } catch {
        // Config file doesn't exist, use defaults
      }

      const relativePath = filePath.replace(workspaceRoot + '/', '')
      const patterns = config.workflow?.workspaces ?? ['.kb/workflows/**/*.yml', 'workflows/**/*.yml']
      const isMatched = patterns.some((pattern: string) => minimatch(relativePath, pattern))

      const summaryLines: string[] = [
        ...keyValue({
          'Workflow ID': id,
          Template: template,
          'File Path': filePath,
        }),
      ]

      if (!isMatched) {
        summaryLines.push('')
        summaryLines.push(
          safeColors.muted(`💡 Add "${dir}/**/*.yml" to kb.config.json workflow.workspaces to discover this workflow`),
        )
      }

      summaryLines.push('')
      summaryLines.push(
        `${safeSymbols.success} ${safeColors.success('Created workflow')} · ${safeColors.muted(formatTiming(tracker.total()))}`,
      )

      ctx.presenter.write('\n' + box('Workflow Initialized', summaryLines))

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const summaryLines: string[] = [
        safeColors.error(message),
        '',
        `${safeSymbols.error} ${safeColors.error('Failed to initialize workflow')} · ${safeColors.muted(formatTiming(tracker.total()))}`,
      ]
      ctx.presenter.write('\n' + box('Workflow Initialization', summaryLines))
      return 1
    }
  },
}

