import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineCommand } from '../index.js';
import type { CliContext } from '@kb-labs/cli-contracts';

describe('defineCommand', () => {
  let mockCtx: CliContext;
  let mockOutput: {
    write: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    ui: {
      box: ReturnType<typeof vi.fn>;
      colors: {
        success: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
      };
    };
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockOutput = {
      write: vi.fn(),
      json: vi.fn(),
      error: vi.fn(),
      ui: {
        box: vi.fn((title, lines) => `${title}\n${lines.join('\n')}`),
        colors: {
          success: vi.fn((s: string) => s),
          error: vi.fn((s: string) => s),
        },
      },
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    mockCtx = {
      cwd: '/test',
      logger: mockLogger as unknown as CliContext['logger'],
      output: mockOutput as unknown as CliContext['output'],
      presenter: {} as CliContext['presenter'],
      env: {},
      diagnostics: [],
    };
  });

  it('should validate flags and call handler', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, result: 'success' });

    const command = defineCommand({
      name: 'test',
      flags: {
        name: { type: 'string', required: true },
        verbose: { type: 'boolean', default: false },
      },
      handler,
    });

    const result = await command(mockCtx, [], { name: 'test', verbose: true });

    expect(result).toBe(0);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[2]).toEqual({ name: 'test', verbose: true });
  });

  it('should return error code when validation fails', async () => {
    const handler = vi.fn();

    const command = defineCommand({
      name: 'test',
      flags: {
        name: { type: 'string', required: true },
      },
      handler,
    });

    const result = await command(mockCtx, [], {});

    expect(result).toBe(1);
    expect(handler).not.toHaveBeenCalled();
    expect(mockOutput.error).toHaveBeenCalled();
  });

  it('should handle handler returning number', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => 0,
    });

    const result = await command(mockCtx, [], {});
    expect(result).toBe(0);
  });

  it('should handle handler returning object with ok', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => ({ ok: true, data: 'test' }),
    });

    const result = await command(mockCtx, [], {});
    expect(result).toBe(0);
  });

  it('should handle errors in handler', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => {
        throw new Error('Handler error');
      },
    });

    const result = await command(mockCtx, [], {});
    expect(result).toBe(1);
    expect(mockOutput.error).toHaveBeenCalled();
  });

  it('should add tracker to context', async () => {
    const handler = vi.fn().mockImplementation((ctx) => {
      expect(ctx.tracker).toBeDefined();
      expect(typeof ctx.tracker.checkpoint).toBe('function');
      return { ok: true };
    });

    const command = defineCommand({
      name: 'test',
      flags: {},
      handler,
    });

    await command(mockCtx, [], {});
    expect(handler).toHaveBeenCalled();
  });

  it('should use custom formatter when provided', async () => {
    const formatter = vi.fn();

    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => ({ ok: true }),
      formatter,
    });

    await command(mockCtx, [], {});

    expect(formatter).toHaveBeenCalled();
    const [result, ctx] = formatter.mock.calls[0] || [];
    expect(result.ok).toBe(true);
    expect(ctx.tracker).toBeDefined();
  });

  it('should output JSON when json flag is set', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => ({ ok: true }),
    });

    await command(mockCtx, [], { json: true });

    expect(mockOutput.json).toHaveBeenCalled();
    const jsonCall = mockOutput.json.mock.calls[0]?.[0];
    expect(jsonCall.ok).toBe(true);
    expect(jsonCall.timingMs).toBeDefined();
  });

  it('should handle analytics integration', async () => {
    const mockEmit = vi.fn().mockResolvedValue({ ok: true });
    const mockRunScope = vi.fn().mockImplementation(async (config, fn) => {
      return await fn(mockEmit);
    });

    const analytics = {
      runScope: mockRunScope,
    };

    const command = defineCommand({
      name: 'test',
      flags: {},
      analytics: {
        startEvent: 'TEST_STARTED',
        finishEvent: 'TEST_FINISHED',
      },
      handler: async () => ({ ok: true }),
    });

    await command({ ...mockCtx, analytics }, [], {});

    expect(mockRunScope).toHaveBeenCalled();
  });

  it('should handle handler returning exit code 2', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => 2,
    });

    const result = await command(mockCtx, [], {});
    expect(result).toBe(2);
  });

  it('should handle handler returning object with ok: false', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => ({ ok: false, error: 'test error' }),
    });

    const result = await command(mockCtx, [], {});
    expect(result).toBe(1);
  });

  it('should log command start and completion', async () => {
    const command = defineCommand({
      name: 'test-command',
      flags: {},
      handler: async () => ({ ok: true }),
    });

    await command(mockCtx, [], {});

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('test-command'),
      expect.any(Object)
    );
  });

  it('should track timing', async () => {
    const handler = vi.fn().mockImplementation(async (ctx) => {
      ctx.tracker.checkpoint('test');
      return { ok: true };
    });

    const command = defineCommand({
      name: 'test',
      flags: {},
      handler,
    });

    await command(mockCtx, [], {});

    expect(mockOutput.json).not.toHaveBeenCalled(); // Not JSON mode
    expect(handler).toHaveBeenCalled();
  });

  it('should handle errors with proper formatting', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => {
        throw new Error('Test error');
      },
    });

    const result = await command(mockCtx, [], {});

    expect(result).toBe(1);
    expect(mockOutput.error).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should handle errors in JSON mode', async () => {
    const command = defineCommand({
      name: 'test',
      flags: {},
      handler: async () => {
        throw new Error('Test error');
      },
    });

    const result = await command(mockCtx, [], { json: true });

    expect(result).toBe(1);
    expect(mockOutput.json).toHaveBeenCalled();
    const jsonCall = mockOutput.json.mock.calls[0]?.[0];
    expect(jsonCall.ok).toBe(false);
    expect(jsonCall.error).toBe('Test error');
  });
});

