import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

vi.mock('@kb-labs/plugin-runtime', () => ({
  execute: vi.fn(),
  createId: vi.fn(() => 'req-123'),
  createPluginContext: vi.fn(() => ({
    host: 'cli',
    requestId: 'req-123',
    pluginId: 'plugin',
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
}));

vi.mock('@kb-labs/setup-engine', () => {
  return {
    createAnalyzer: vi.fn(() => ({
      analyzeAll: vi.fn(async (operations: any[]) => {
        const map = new Map<string, { needed: boolean; risk: 'safe' }>();
        for (const op of operations) {
          map.set(op.metadata.id, { needed: true, risk: 'safe' });
        }
        return map;
      }),
    })),
    createPlanner: vi.fn(() => ({
      plan: vi.fn((operations: any[]) => ({
        stages: [
          {
            id: 'stage-1',
            operations,
            parallel: false,
          },
        ],
        diff: {
          files: [],
          configs: [],
          summary: { created: 0, modified: 0, deleted: 0 },
        },
        risks: { overall: 'safe', byOperation: new Map() },
      })),
    })),
    createExecutor: vi.fn(() => ({
      execute: vi.fn(async (plan: any) => ({
        success: true,
        applied: plan.stages.flatMap((stage: any) => stage.operations),
        rollbackAvailable: false,
      })),
    })),
    createChangeJournal: vi.fn(() => ({
      startStage: vi.fn(),
      beforeOperation: vi.fn(),
      afterOperation: vi.fn(),
      commitStage: vi.fn(),
      rollback: vi.fn(),
      getLogPath: vi.fn(() => ''),
      getArtifacts: vi.fn(() => ({ backups: [], logs: [] })),
      setLogPath: vi.fn(),
      getEntries: vi.fn(() => []),
    })),
    createOperationRegistry: vi.fn(() => ({
      registerAnalyzer: vi.fn(),
      registerDiffBuilder: vi.fn(),
      registerExecutor: vi.fn(),
      getAnalyzer: vi.fn(),
      getDiffBuilder: vi.fn(),
      getExecutor: vi.fn(),
    })),
  };
});

import { execute } from '@kb-labs/plugin-runtime';
import { createPluginSetupCommand } from '../commands/system/plugin-setup-command.js';

const executeMock = vi.mocked(execute);

describe('plugin setup command', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'kb-cli-setup-'));
    executeMock.mockReset();
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('writes config and marker when setup succeeds', async () => {
    executeMock.mockResolvedValue({
      ok: true,
      data: {
        configDefaults: {
          enabled: true,
          profiles: { default: 'frontend' },
        },
      },
      metrics: { timeMs: 10 },
    } as any);

    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: '@kb-labs/example',
      version: '1.0.0',
      setup: {
        handler: './setup/handler.ts#run',
        describe: 'Example setup',
        permissions: {
          fs: {
            mode: 'readWrite',
            allow: ['.kb/example/**'],
          },
        },
      },
    };

    const command = createPluginSetupCommand({
      manifest,
      namespace: 'example',
      packageName: '@kb-labs/example-cli',
      pkgRoot: cwd,
    });

    const ctx = {
      cwd,
      presenter: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    const exitCode = await command.run(ctx, [], {});
    expect(exitCode).toBe(0);

    const configPath = path.join(cwd, '.kb', 'kb-labs.config.json');
    const configContent = await readFile(configPath, 'utf8');
    expect(JSON.parse(configContent)).toMatchObject({
      schemaVersion: '1.0',
      plugins: {
        example: {
          enabled: true,
          profiles: { default: 'frontend' },
        },
      },
    });

    await expect(
      access(path.join(cwd, '.kb', 'example', '.setup-complete')),
    ).resolves.toBeUndefined();

    const call = executeMock.mock.calls[0];
    expect(call[0].perms.fs?.deny).toEqual(
      expect.arrayContaining(['.kb/plugins.json', '.kb/kb-labs.config.json']),
    );
  });

  it('skips execution when --kb-only removes all allowed paths', async () => {
    executeMock.mockResolvedValue({
      ok: true,
      data: {},
      metrics: { timeMs: 5 },
    } as any);

    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: '@kb-labs/example',
      version: '1.0.0',
      setup: {
        handler: './setup/handler.ts#run',
        describe: 'Example setup',
        permissions: {
          fs: {
            mode: 'readWrite',
            allow: ['src/**'],
          },
        },
      },
    };

    const command = createPluginSetupCommand({
      manifest,
      namespace: 'example',
      packageName: '@kb-labs/example-cli',
      pkgRoot: cwd,
    });

    const ctx = {
      cwd,
      presenter: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    const exitCode = await command.run(ctx, [], { 'kb-only': true });
    expect(exitCode).toBe(0);

    expect(executeMock).toHaveBeenCalledTimes(1);
    const perms = executeMock.mock.calls[0][0].perms;
    expect(perms.fs?.allow).toEqual(['.kb/**']);
  });
});

