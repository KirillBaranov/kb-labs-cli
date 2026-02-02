import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { minimatch } from 'minimatch'
import {
  TimingTracker,
  box,
  keyValue,
  formatTiming,
} from '@kb-labs/shared-cli-ui'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'

type WorkflowInitResult = CommandResult & {
  id?: string;
  template?: string;
  filePath?: string;
};

type WfInitFlags = {
  id: { type: 'string'; description?: string; required: true };
  template: { type: 'string'; description?: string; choices?: readonly string[]; required: true };
  dir: { type: 'string'; description?: string; default?: string };
};

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

export const wfInit = defineSystemCommand<WfInitFlags, WorkflowInitResult>({
  name: 'init',
  description: 'Initialize a new workflow',
  category: 'workflows',
  aliases: ['wf:init'],
  flags: {
    id: { type: 'string', description: 'Workflow ID (filename without extension)', required: true },
    template: {
      type: 'string',
      description: 'Template to use',
      choices: Object.keys(TEMPLATES) as readonly string[],
      required: true,
    },
    dir: { type: 'string', description: 'Output directory', default: '.kb/workflows' },
  },
  examples: [
    'kb wf init --id my-workflow --template empty',
    'kb wf init --id ai-ci --template ai-ci-standard',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const tracker = new TimingTracker()

    try {
      tracker.checkpoint('start')
      const output = ctx.output;
      const logger = ctx.logger;
      
      const id = String(flags.id) // Type-safe: string (required)
      const template = String(flags.template) // Type-safe: string (required)
      const dir = (flags.dir as string | undefined) ?? '.kb/workflows' // Type-safe: string | undefined -> string

      // Validate template
      if (!(template in TEMPLATES)) {
        logger?.error('Invalid template', { template, available: Object.keys(TEMPLATES) });
        output?.error(`Invalid template: ${template}. Available: ${Object.keys(TEMPLATES).join(', ')}`)
        return { ok: false, error: `Invalid template: ${template}` }
      }

      // Validate ID format
      if (!/^[a-z0-9-]+$/.test(id)) {
        logger?.error('Invalid workflow ID format', { id });
        output?.error('Workflow ID must contain only lowercase letters, numbers, and hyphens')
        return { ok: false, error: 'Invalid workflow ID format' }
      }

      const workspaceRoot = process.cwd()

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
          'Workflow ID': String(id),
          Template: String(template),
          'File Path': filePath,
        }),
      ]

      if (!isMatched) {
        summaryLines.push('')
        summaryLines.push(
          `${output?.ui.colors.muted(`💡 Add "${dir}/**/*.yml" to kb.config.json workflow.workspaces to discover this workflow`) ?? `💡 Add "${dir}/**/*.yml" to kb.config.json workflow.workspaces to discover this workflow`}`,
        )
      }

      summaryLines.push('')
      summaryLines.push(
        `${output?.ui.symbols.success ?? '✓'} ${output?.ui.colors.success('Created workflow') ?? 'Created workflow'} · ${output?.ui.colors.muted(formatTiming(tracker.total())) ?? formatTiming(tracker.total())}`,
      )

      logger?.info('Workflow initialized successfully', {
        id,
        template,
        filePath,
        durationMs: tracker.total(),
      });

      output?.write('\n' + box('Workflow Initialized', summaryLines))

      return { ok: true, id, template, filePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const output = ctx.output;
      const logger = ctx.logger;
      
      logger?.error('Failed to initialize workflow', {
        error: message,
        id: flags.id as string | undefined,
        template: flags.template as string | undefined,
        durationMs: tracker.total(),
      });
      
      const summaryLines: string[] = [
        output?.ui.colors.error(message) ?? message,
        '',
        `${output?.ui.symbols.error ?? '✗'} ${output?.ui.colors.error('Failed to initialize workflow') ?? 'Failed to initialize workflow'} · ${output?.ui.colors.muted(formatTiming(tracker.total())) ?? formatTiming(tracker.total())}`,
      ]
      output?.write('\n' + box('Workflow Initialization', summaryLines))
      return { ok: false, error: message }
    }
  },
})
