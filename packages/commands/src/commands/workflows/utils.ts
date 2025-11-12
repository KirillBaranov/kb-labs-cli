import type { EngineLogger } from '@kb-labs/workflow-engine'
import { WorkflowLoader } from '@kb-labs/workflow-engine'
import { formatTiming, safeColors, safeSymbols, keyValue } from '@kb-labs/shared-cli-ui'
import type { WorkflowRun } from '@kb-labs/workflow-contracts'

export interface WorkflowSpecFlags {
  file?: string
  inline?: string
  stdin?: boolean
  specRef?: string
  verbose?: boolean
}

export interface WorkflowSpecResolution {
  source: string
  spec: any
}

export type StatusKind = 'success' | 'warning' | 'error'

type CliPresenter = {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  write?(message: string): void
  json?(value: unknown): void
  success?(message: string): void
}

interface CliContext {
  presenter: CliPresenter
  cwd?: string
}

export function createCliEngineLogger(
  ctx: CliContext,
  verbose = false,
): EngineLogger {
  const write = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    if (level === 'debug' && !verbose) {
      return
    }
    const line =
      meta && Object.keys(meta).length > 0
        ? `${message} ${JSON.stringify(meta)}`
        : message
    if (level === 'error') {
      ctx.presenter.error(line)
    } else if (level === 'warn') {
      ctx.presenter.warn(line)
    } else {
      ctx.presenter.info(line)
    }
  }

  return {
    debug(message, meta) {
      write('debug', message, meta)
    },
    info(message, meta) {
      write('info', message, meta)
    },
    warn(message, meta) {
      write('warn', message, meta)
    },
    error(message, meta) {
      write('error', message, meta)
    },
  }
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
    })
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()))
    process.stdin.on('error', reject)
  })
}

export async function resolveWorkflowSpec(
  ctx: CliContext,
  flags: WorkflowSpecFlags,
  defaultFile = 'kb.workflow.yml',
): Promise<WorkflowSpecResolution> {
  const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))
  const loader = new WorkflowLoader(logger)

  if (flags.inline) {
    return loader.fromInline(flags.inline, 'inline')
  }

  if (flags.stdin) {
    const stdinContent = await readStdin()
    return loader.fromInline(stdinContent, 'stdin')
  }

  if (flags.specRef) {
    throw new Error('--spec-ref support not implemented yet')
  }

  const filePath = flags.file ?? defaultFile
  return loader.fromFile(filePath, { cwd: ctx.cwd ?? process.cwd() })
}

const statusKindMap: Record<string, StatusKind> = {
  success: 'success',
  failed: 'error',
  cancelled: 'warning',
  running: 'warning',
  queued: 'warning',
  skipped: 'warning',
}

export function toStatusKind(status: string): StatusKind {
  return statusKindMap[status] ?? 'warning'
}

export function statusBadge(status: string): string {
  const kind = toStatusKind(status)
  const color =
    kind === 'success'
      ? safeColors.success
      : kind === 'error'
        ? safeColors.error
        : safeColors.warning
  const symbol =
    kind === 'success'
      ? safeSymbols.success
      : kind === 'error'
        ? safeSymbols.error
        : safeSymbols.warning
  return `${symbol} ${color(status)}`
}

export function renderStatusLine(
  label: string,
  kind: StatusKind,
  durationMs?: number,
): string {
  const color =
    kind === 'success'
      ? safeColors.success
      : kind === 'error'
        ? safeColors.error
        : safeColors.warning
  const symbol =
    kind === 'success'
      ? safeSymbols.success
      : kind === 'error'
        ? safeSymbols.error
        : safeSymbols.warning

  const timing = durationMs !== undefined ? safeColors.muted(formatTiming(durationMs)) : ''
  return `${symbol} ${color(label)}${timing ? ` · ${timing}` : ''}`
}

export function formatRunHeader(run: WorkflowRun, durationMs?: number): string[] {
  const lines: string[] = [
    ...keyValue({
      Workflow: `${run.name}@${run.version}`,
      Run: run.id,
      Status: run.status,
      Trigger: run.trigger.type,
    }),
  ]

  if (run.metadata?.idempotencyKey) {
    lines.push(
      ...keyValue({
        Idempotency: run.metadata.idempotencyKey,
      }),
    )
  }
  if (run.metadata?.concurrencyGroup) {
    lines.push(
      ...keyValue({
        'Concurrency group': run.metadata.concurrencyGroup,
      }),
    )
  }

  if (run.createdAt) {
    lines.push(
      ...keyValue({
        Created: run.createdAt,
      }),
    )
  }
  if (run.startedAt) {
    lines.push(
      ...keyValue({
        Started: run.startedAt,
      }),
    )
  }
  if (run.finishedAt) {
    lines.push(
      ...keyValue({
        Finished: run.finishedAt,
      }),
    )
  }

  lines.push('')
  lines.push(renderStatusLine('Workflow run', toStatusKind(run.status), durationMs))

  return lines
}


