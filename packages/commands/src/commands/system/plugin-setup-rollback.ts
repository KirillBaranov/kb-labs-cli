import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from '../../types/index.js';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { JournalEntry } from '@kb-labs/setup-engine';

interface SetupRollbackCommandFactoryOptions {
  namespace: string;
  manifest: ManifestV2;
  packageName: string;
  pkgRoot: string;
}

const ROLLBACK_COMMAND_FLAGS: Command['flags'] = [
  {
    name: 'log',
    type: 'string',
    description: 'Path to a setup change log JSON file. Defaults to latest log for the namespace.',
  },
  {
    name: 'list',
    type: 'boolean',
    description: 'List available setup change logs and exit.',
  },
  {
    name: 'yes',
    type: 'boolean',
    alias: 'y',
    description: 'Apply rollback without confirmation prompt.',
  },
];

export function createPluginSetupRollbackCommand(
  options: SetupRollbackCommandFactoryOptions,
): Command {
  const { namespace } = options;

  return {
    name: `${namespace}:setup:rollback`,
    describe: `Rollback setup changes applied by ${namespace}`,
    category: namespace,
    examples: [
      `kb ${namespace} setup:rollback --list`,
      `kb ${namespace} setup:rollback --log .kb/logs/setup/${namespace}-<id>.json --yes`,
    ],
    flags: ROLLBACK_COMMAND_FLAGS,
    async run(ctx, argv, rawFlags) {
      const presenter = ctx.presenter ?? {};
      const output = ctx.output;
      const logger = ctx.logger;
      const cwd = getContextCwd(ctx) ?? process.cwd();
      
      logger?.info('Plugin setup rollback started', { namespace });
      const logsDir = path.join(cwd, '.kb', 'logs', 'setup');

      const listOnly = rawFlags.list === true;
      const autoConfirm = rawFlags.yes === true;
      const logFlag = typeof rawFlags.log === 'string' ? rawFlags.log : undefined;

      try {
        await fs.mkdir(logsDir, { recursive: true });

        if (listOnly) {
          await listLogs(logsDir, namespace, output || presenter, logger);
          return 0;
        }

        const resolvedLogPath =
          logFlag
            ? resolveLogPath(logsDir, logFlag, cwd)
            : await findLatestLog(logsDir, namespace);

        if (!resolvedLogPath) {
          logger?.warn('No setup log found', { namespace, logFlag });
          (output || presenter)?.error?.(
            `Не найден ни один лог setup для ${namespace}. Используйте --log для указания файла.`,
          );
          return 1;
        }

        logger?.info('Using setup log', { logPath: resolvedLogPath });
        (output || presenter)?.info?.(`~ Используем лог: ${path.relative(cwd, resolvedLogPath)}`);

        if (!autoConfirm) {
          (output || presenter)?.warn?.('Добавьте флаг --yes для подтверждения отката.');
          return 1;
        }

        const entries = await readJournalEntries(resolvedLogPath);
        if (entries.length === 0) {
          logger?.warn('Setup log is empty', { logPath: resolvedLogPath });
          (output || presenter)?.warn?.('Лог пустой, откатывать нечего.');
          return 0;
        }

        logger?.info('Applying rollback', { entriesCount: entries.length });
        await applyRollback(entries, cwd, output || presenter, logger);
        logger?.info('Rollback completed');
        (output || presenter)?.info?.('✓ Откат завершён.');
        return 0;
      } catch (error) {
        logger?.error('Rollback failed', { 
          error: error instanceof Error ? error.message : String(error),
        });
        (output || presenter)?.error?.(error);
        return 1;
      }
    },
  };
}

function resolveLogPath(logsDir: string, inputPath: string, cwd: string): string {
  const candidate = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(cwd, inputPath);
  if (candidate.startsWith(logsDir)) {
    return candidate;
  }
  return candidate;
}

async function listLogs(logsDir: string, namespace: string, output: any, logger?: any): Promise<void> {
  const files = await safeReadDir(logsDir);
  const filtered = files
    .filter((file) => file.startsWith(namespace) && file.endsWith('.json'))
    .sort()
    .reverse();

  logger?.info('Listing setup logs', { namespace, count: filtered.length });

  if (filtered.length === 0) {
    output?.info?.('Логи не найдены.');
    return;
  }

  output?.info?.('Доступные логи setup:');
  for (const file of filtered) {
    output?.info?.(` • ${file}`);
  }
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function findLatestLog(logsDir: string, namespace: string): Promise<string | null> {
  const entries = await safeReadDir(logsDir);
  const candidates = await Promise.all(
    entries
      .filter((file) => file.startsWith(namespace) && file.endsWith('.json'))
      .map(async (file) => {
        const fullPath = path.join(logsDir, file);
        const stat = await fs.stat(fullPath);
        return { path: fullPath, mtime: stat.mtimeMs };
      }),
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

async function readJournalEntries(logPath: string): Promise<JournalEntry[]> {
  const content = await fs.readFile(logPath, 'utf8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error('Неверный формат лога setup.');
  }
  return parsed as JournalEntry[];
}

async function applyRollback(entries: JournalEntry[], cwd: string, output: any, logger?: any): Promise<void> {
  logger?.info('Applying rollback operations', { entriesCount: entries.length });
  
  for (const entry of [...entries].reverse()) {
    const operation = entry.operation?.operation;
    if (!operation) continue;

    switch (operation.kind) {
      case 'file':
      case 'config':
      case 'script':
        await restoreFileLikeOperation(entry, cwd, output, logger);
        break;
      default:
        logger?.warn('Skipping operation (rollback not implemented)', { kind: operation.kind });
        output?.warn?.(
          `Пропуск операции ${operation.kind} (откат не реализован).`,
        );
    }
  }
}

async function restoreFileLikeOperation(entry: JournalEntry, cwd: string, output: any, logger?: any): Promise<void> {
  const operation = entry.operation.operation as
    | { kind: 'file'; path: string }
    | { kind: 'config'; path: string }
    | { kind: 'script'; file: string };

  const relativePath =
    operation.kind === 'script'
      ? operation.file
      : operation.path;

  const targetPath = resolveWithinWorkspace(cwd, relativePath);

  if (entry.backupPath) {
    await copyBackup(entry.backupPath, targetPath, output, logger);
    return;
  }

  if (entry.before?.exists === false) {
    await fs.rm(targetPath, { force: true, recursive: false });
    logger?.info('File removed during rollback', { path: targetPath });
    output?.info?.(`− Удалён ${path.relative(cwd, targetPath)}`);
    return;
  }

  if (typeof entry.before?.content === 'string') {
    if (entry.before.content.startsWith('<truncated')) {
      logger?.warn('Skipping truncated file', { path: targetPath });
      output?.warn?.(
        `Пропуск ${path.relative(cwd, targetPath)} — содержимое лога усечено.`,
      );
      return;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, entry.before.content, 'utf8');
    logger?.info('File restored from log', { path: targetPath });
    output?.info?.(`↺ Восстановлен ${path.relative(cwd, targetPath)}`);
    return;
  }

  logger?.warn('Skipping file (no restore data)', { path: targetPath });
  output?.warn?.(
    `Пропуск ${path.relative(cwd, targetPath)} — отсутствуют данные для восстановления.`,
  );
}

function resolveWithinWorkspace(workspace: string, target: string): string {
  const resolvedWorkspace = path.resolve(workspace);
  const resolvedTarget = path.resolve(resolvedWorkspace, target);
  if (!resolvedTarget.startsWith(resolvedWorkspace)) {
    throw new Error(`Путь ${target} выходит за пределы рабочей директории.`);
  }
  return resolvedTarget;
}

async function copyBackup(backupPath: string, destination: string, output: any, logger?: any): Promise<void> {
  try {
    await fs.access(backupPath);
  } catch {
    logger?.warn('Backup not found', { backupPath });
    output?.warn?.(`Пропуск — backup ${backupPath} не найден.`);
    return;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(backupPath, destination);
  logger?.info('File restored from backup', { backupPath, destination });
  output?.info?.(`↺ Восстановлен из backup ${path.basename(destination)}`);
}

