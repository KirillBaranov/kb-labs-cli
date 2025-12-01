import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { OperationWithMetadata } from '@kb-labs/setup-engine-operations';
import { createPluginSetupCommand } from '../commands/system/plugin-setup-command';
import { createPluginSetupRollbackCommand } from '../commands/system/plugin-setup-rollback';

const fs = await import('node:fs/promises');

vi.mock('@kb-labs/plugin-runtime', () => {
  let counter = 0;
  return {
    execute: vi.fn(),
    createId: () => `req-${++counter}`,
    createPluginContext: vi.fn(() => ({
      host: 'cli',
      requestId: `req-${counter}`,
      pluginId: '@kb-labs/template',
      pluginVersion: '1.0.0',
      presenter: {
        message: vi.fn(),
        progress: vi.fn(),
        json: vi.fn(),
        error: vi.fn(),
      },
      events: {} as any,
      analytics: {} as any,
      capabilities: {
        has: () => false,
        extend: () => undefined,
      },
    })),
    getTrackedOperations: vi.fn(() => []),
    OperationTracker: class {
      toArray() {
        return [];
      }
    },
  };
});

vi.mock('@kb-labs/core-config', () => {
  return {
    readWorkspaceConfig: vi.fn(async (cwd: string) => {
      const configPath = path.join(cwd, '.kb', 'kb-labs.config.json');
      try {
        const data = JSON.parse(await fsp.readFile(configPath, 'utf8'));
        return { path: configPath, data };
      } catch {
        return null;
      }
    }),
    writeFileAtomic: vi.fn(async (filePath: string, data: string | Buffer) => {
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, data);
    }),
  };
});

const { execute } = await import('@kb-labs/plugin-runtime');
const executeMock = vi.mocked(execute);

const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/template',
  version: '1.0.0',
  setup: {
    handler: './setup/handler.ts#run',
    describe: 'Template setup',
    permissions: {
      fs: { mode: 'readWrite', allow: ['.kb/template/**'] },
    },
  },
};

describe('plugin setup command (integration)', () => {
  let cwd: string;
  const namespace = 'template';

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'kb-cli-setup-e2e-'));
    mockExecuteResponse(buildOperations());
  });

  afterEach(async () => {
    executeMock.mockReset();
    await rm(cwd, { recursive: true, force: true });
  });

  it('applies operations end-to-end', async () => {
    const command = createSetupCommand(cwd);
    const presenter = createPresenter();

    const exitCode = await command.run({ cwd, presenter }, [], {});
    expect(exitCode).toBe(0);

    await expect(access(path.join(cwd, '.kb', 'template', 'hello.txt'))).resolves.toBeUndefined();
    await expect(access(path.join(cwd, '.kb', 'template', '.setup-complete'))).resolves.toBeUndefined();

    const config = JSON.parse(
      await readFile(path.join(cwd, '.kb', 'kb-labs.config.json'), 'utf8'),
    );
    expect(config.plugins?.template?.enabled).toBe(true);
    expect(await latestLogPath(cwd, namespace)).toBeTruthy();
  });

  it('is idempotent on repeated runs', async () => {
    const command = createSetupCommand(cwd);
    const presenter = createPresenter();
    await command.run({ cwd, presenter }, [], {});

    mockExecuteResponse(buildOperations());
    const secondExitCode = await command.run({ cwd, presenter }, [], {});
    expect(secondExitCode).toBe(0);

    const logFiles = await fsp.readdir(path.join(cwd, '.kb', 'logs', 'setup'));
    expect(logFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('respects --dry-run flag', async () => {
    const command = createSetupCommand(cwd);
    const presenter = createPresenter();

    const exitCode = await command.run({ cwd, presenter }, [], { 'dry-run': true });
    expect(exitCode).toBe(0);

    await expect(access(path.join(cwd, '.kb', 'template', 'hello.txt'))).rejects.toBeTruthy();
  });

  it('rolls back using setup change log', async () => {
    const setupCommand = createSetupCommand(cwd);
    const presenter = createPresenter();
    await setupCommand.run({ cwd, presenter }, [], {});

    const logPath = await latestLogPath(cwd, namespace);
    expect(logPath).toBeTruthy();

    const rollbackCommand = createPluginSetupRollbackCommand({
      manifest,
      namespace,
      packageName: '@kb-labs/template-cli',
      pkgRoot: cwd,
    });

    const rollbackPresenter = createPresenter();
    const exitCode = await rollbackCommand.run(
      { cwd, presenter: rollbackPresenter },
      [],
      { log: logPath!, yes: true },
    );
    expect(exitCode).toBe(0);

    await expect(access(path.join(cwd, '.kb', 'template', 'hello.txt'))).rejects.toBeTruthy();
  });
});

function mockExecuteResponse(operations: OperationWithMetadata[]) {
  executeMock.mockResolvedValue({
    ok: true,
    data: {
      operations,
      configDefaults: {
        enabled: true,
        greeting: { configPath: '.kb/template/hello.txt' },
      },
    },
    metrics: { timeMs: 5 },
  } as any);
}

function buildOperations(): OperationWithMetadata[] {
  return [
    {
      operation: {
        kind: 'file',
        action: 'ensure',
        path: '.kb/template/hello.txt',
        content: 'hello world',
      },
      metadata: {
        id: 'file-hello',
        description: 'Ensure hello file',
        idempotent: true,
        reversible: true,
      },
    },
    {
      operation: {
        kind: 'config',
        action: 'merge',
        path: '.kb/kb-labs.config.json',
        pointer: '/plugins/template',
        value: { enabled: true },
      },
      metadata: {
        id: 'config-template',
        description: 'Set template config',
        idempotent: true,
        reversible: true,
      },
    },
  ];
}

function createSetupCommand(cwd: string) {
  return createPluginSetupCommand({
    manifest,
    namespace: 'template',
    packageName: '@kb-labs/template-cli',
    pkgRoot: cwd,
  });
}

function createPresenter() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function latestLogPath(cwd: string, namespace: string): Promise<string | null> {
  const logsDir = path.join(cwd, '.kb', 'logs', 'setup');
  try {
    const files = await fsp.readdir(logsDir);
    const candidates = files
      .filter((file) => file.startsWith(namespace) && file.endsWith('.json'))
      .map((file) => path.join(logsDir, file))
      .sort();
    return candidates.at(-1) ?? null;
  } catch {
    return null;
  }
}

