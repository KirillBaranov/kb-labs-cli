import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { JournalEntry } from '@kb-labs/setup-engine';
import { createPluginSetupRollbackCommand } from '../commands/system/plugin-setup-rollback.js';

const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/template',
  version: '1.0.0',
  setup: {
    handler: './setup/handler.ts#run',
    permissions: {
      fs: {
        mode: 'readWrite',
        allow: ['.kb/template/**'],
      },
    },
  },
};

describe('plugin setup rollback command', () => {
  let cwd: string;
  let logsDir: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'kb-cli-rollback-'));
    logsDir = path.join(cwd, '.kb', 'logs', 'setup');
    await mkdir(logsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('lists available logs', async () => {
    await writeFile(path.join(logsDir, 'template-1.json'), '[]', 'utf8');
    await writeFile(path.join(logsDir, 'template-2.json'), '[]', 'utf8');

    const command = createPluginSetupRollbackCommand({
      manifest,
      namespace: 'template',
      packageName: '@kb-labs/template-cli',
      pkgRoot: cwd,
    });

    const presenter = createPresenter();
    const exitCode = await command.run(
      { cwd, presenter },
      [],
      { list: true },
    );

    expect(exitCode).toBe(0);
    expect(presenter.info).toHaveBeenCalledWith('Доступные логи setup:');
    expect(
      presenter.info.mock.calls.some(([msg]) =>
        String(msg).includes('template-1.json'),
      ),
    ).toBe(true);
  });

  it('requires --yes before applying rollback', async () => {
    const logPath = await writeJournal(logsDir, [
      createFileEntry('README.md', { exists: false }),
    ]);
    const targetPath = path.join(cwd, 'README.md');
    await writeFile(targetPath, 'NEW CONTENT', 'utf8');

    const command = createPluginSetupRollbackCommand({
      manifest,
      namespace: 'template',
      packageName: '@kb-labs/template-cli',
      pkgRoot: cwd,
    });

    const presenter = createPresenter();
    const exitCode = await command.run(
      { cwd, presenter },
      [],
      { log: logPath },
    );

    expect(exitCode).toBe(1);
    await expect(access(targetPath)).resolves.toBeUndefined();
    expect(presenter.warn).toHaveBeenCalledWith('Добавьте флаг --yes для подтверждения отката.');
  });

  it('restores files based on journal entries', async () => {
    const targetRelative = '.kb/template/hello.txt';
    const targetPath = path.join(cwd, targetRelative);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, 'after-setup', 'utf8');

    const logPath = await writeJournal(logsDir, [
      createFileEntry(targetRelative, {
        exists: false,
      }),
    ]);

    const command = createPluginSetupRollbackCommand({
      manifest,
      namespace: 'template',
      packageName: '@kb-labs/template-cli',
      pkgRoot: cwd,
    });

    const presenter = createPresenter();
    const exitCode = await command.run(
      { cwd, presenter },
      [],
      { log: logPath, yes: true },
    );

    expect(exitCode).toBe(0);
    await expect(access(targetPath)).rejects.toBeTruthy();
  });
});

function createPresenter() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function writeJournal(logsDir: string, entries: JournalEntry[]): Promise<string> {
  const logPath = path.join(logsDir, `template-${Date.now()}.json`);
  await writeFile(logPath, JSON.stringify(entries, null, 2), 'utf8');
  return logPath;
}

function createFileEntry(pathname: string, before: JournalEntry['before']): JournalEntry {
  return {
    timestamp: new Date().toISOString(),
    operation: {
      operation: {
        kind: 'file',
        action: 'ensure',
        path: pathname,
        content: 'after-setup',
      },
      metadata: {
        id: 'file-1',
        description: 'Ensure file',
        idempotent: true,
        reversible: true,
      },
    },
    before: before ?? { exists: true, content: 'before-content' },
    after: { exists: true, content: 'after-setup' },
  };
}

