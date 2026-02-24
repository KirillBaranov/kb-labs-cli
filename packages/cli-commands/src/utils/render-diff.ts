import type {
  ExecutionPlan,
  FileDiff,
  ConfigDiff,
  PlanStage,
} from '@kb-labs/setup-engine-core';
import type {
  Operation,
  OperationWithMetadata,
} from '@kb-labs/setup-engine-operations';

const INDENT = '  ';
const BULLET = '-';

export function renderSetupDiff(plan: ExecutionPlan): string[] {
  const lines: string[] = [];

  lines.push('Setup plan preview');
  lines.push(`${INDENT}Overall risk: ${plan.risks.overall.toUpperCase()}`);

  if (plan.warnings?.length) {
    lines.push(`${INDENT}Warnings:`);
    for (const warning of plan.warnings) {
      lines.push(`${INDENT.repeat(2)}${BULLET} ${warning}`);
    }
  }

  for (let i = 0; i < plan.stages.length; i += 1) {
    const stage = plan.stages[i];
    if (!stage) { continue; }
    lines.push('');
    lines.push(formatStageHeader(stage, i));
    stage.operations.forEach((operation, index) => {
      const risk =
        plan.risks.byOperation.get(operation.metadata.id) ??
        plan.risks.overall;
      lines.push(
        formatOperationLine(operation, {
          risk,
          index: index + 1,
          indentLevel: 2,
        }),
      );
    });
  }

  lines.push('');
  lines.push(`${INDENT}Diff summary:`);
  lines.push(
    `${INDENT.repeat(2)}files +${plan.diff.summary.created} / ~${plan.diff.summary.modified} / -${plan.diff.summary.deleted}`,
  );

  if (plan.diff.files.length > 0) {
    lines.push('');
    lines.push(`${INDENT}Files:`);
    for (const diff of plan.diff.files) {
      lines.push(...formatFileDiff(diff, 2));
    }
  }

  if (plan.diff.configs.length > 0) {
    lines.push('');
    lines.push(`${INDENT}Config:`);
    for (const config of plan.diff.configs) {
      lines.push(...formatConfigDiff(config, 2));
    }
  }

  if (plan.diff.files.length === 0 && plan.diff.configs.length === 0) {
    lines.push(`${INDENT}(no detected file/config changes)`);
  }

  return lines;
}

function formatStageHeader(stage: PlanStage, index: number): string {
  const mode = stage.parallel ? 'parallel' : 'serial';
  const count = stage.operations.length;
  return `${INDENT}Stage ${index + 1} (${stage.id}, ${mode}, ${count} op${count === 1 ? '' : 's'})`;
}

function formatOperationLine(
  operation: OperationWithMetadata,
  options: { risk: string; index: number; indentLevel: number },
): string {
  const indent = INDENT.repeat(options.indentLevel);
  const risk = options.risk.toUpperCase();
  const label = describeOperation(operation.operation);
  const description =
    operation.metadata.description && operation.metadata.description !== label
      ? ` — ${operation.metadata.description}`
      : '';

  return `${indent}${options.index}. [${risk}] ${label}${description}`;
}

function describeOperation(operation: Operation): string {
  switch (operation.kind) {
    case 'file': {
      const actionLabel =
        operation.action === 'ensure'
          ? 'create'
          : operation.action === 'update'
            ? 'update'
            : 'delete';
      return `${actionLabel} ${operation.path}`;
    }
    case 'config': {
      const verb =
        operation.action === 'merge'
          ? 'merge'
          : operation.action === 'set'
            ? 'set'
            : 'unset';
      return `${verb} ${operation.path}${operation.pointer}`;
    }
    case 'code': {
      if (operation.action === 'ensureImport' && operation.import) {
        const symbols = [
          operation.import.default,
          ...(operation.import.named ?? []),
          operation.import.namespace
            ? `* as ${operation.import.namespace}`
            : undefined,
        ].filter(Boolean);
        return `ensure import { ${symbols.join(', ')} } from ${operation.import.specifier} in ${operation.file}`;
      }
      if (operation.action === 'patch' && operation.patch) {
        return `patch ${operation.file} (${operation.patch.description ?? operation.patch.selector})`;
      }
      return `${operation.action} ${operation.file}`;
    }
    case 'script': {
      const op =
        operation.action === 'delete'
          ? 'remove'
          : operation.action === 'update'
            ? 'update'
            : 'ensure';
      return `${op} script "${operation.name}" in ${operation.file}`;
    }
    default:
      return (operation as { kind: string }).kind;
  }
}

function formatFileDiff(diff: FileDiff, indentLevel: number): string[] {
  const indent = INDENT.repeat(indentLevel);
  const lines = [`${indent}${BULLET} [${diff.status.toUpperCase()}] ${diff.path}`];

  if (diff.unified) {
    lines.push(`${indent}${INDENT}diff:`);
    for (const line of diff.unified.split('\n')) {
      lines.push(`${indent}${INDENT}${line}`);
    }
    return lines;
  }

  if (diff.preview?.before !== undefined || diff.preview?.after !== undefined) {
    if (diff.preview.before !== undefined) {
      lines.push(
        `${indent}${INDENT}- ${trimPreview(diff.preview.before)}`,
      );
    }
    if (diff.preview.after !== undefined) {
      lines.push(`${indent}${INDENT}+ ${trimPreview(diff.preview.after)}`);
    }
  }

  return lines;
}

function formatConfigDiff(
  diff: ConfigDiff,
  indentLevel: number,
): string[] {
  const indent = INDENT.repeat(indentLevel);
  const lines = [
    `${indent}${BULLET} ${diff.path} ${diff.pointer}`,
  ];

  if (diff.before !== undefined) {
    lines.push(`${indent}${INDENT}- ${trimPreview(diff.before)}`);
  }
  if (diff.after !== undefined) {
    lines.push(`${indent}${INDENT}+ ${trimPreview(diff.after)}`);
  }

  return lines;
}

export function trimPreview(value: unknown): string {
  if (value === undefined) {
    return '(undefined)';
  }

  const stringValue =
    typeof value === 'string' ? value : safelyStringify(value);

  if (stringValue.length <= 120) {
    return stringValue;
  }

  return `${stringValue.slice(0, 117)}...`;
}

function safelyStringify(value: unknown): string {
  try {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
