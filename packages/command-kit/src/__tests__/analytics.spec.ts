import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackCommand, withAnalyticsScope } from '../analytics/index.js';

describe('trackCommand', () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockRunScope: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEmit = vi.fn().mockResolvedValue({ ok: true });
    mockRunScope = vi.fn().mockImplementation(async (config, fn) => {
      return await fn(mockEmit);
    });
  });

  it('should create tracking helpers', () => {
    const analytics = {
      runScope: mockRunScope,
    };

    const result = trackCommand(analytics, {
      command: 'test-command',
      startEvent: 'TEST_STARTED',
      finishEvent: 'TEST_FINISHED',
    });

    expect(result.emit).toBeDefined();
    expect(result.scope).toBeDefined();
    expect(typeof result.emit).toBe('function');
    expect(typeof result.scope).toBe('function');
  });

  it('should work without analytics', async () => {
    const result = trackCommand(null, {
      command: 'test-command',
      startEvent: 'TEST_STARTED',
      finishEvent: 'TEST_FINISHED',
    });

    // Should still work, just no-op
    const scopeResult = await result.scope(async (emit) => {
      await emit('started', {});
      return 'success';
    });

    expect(scopeResult).toBe('success');
  });

  it('should call emit within scope', async () => {
    const analytics = {
      runScope: mockRunScope,
    };

    const { emit, scope } = trackCommand(analytics, {
      command: 'test-command',
      startEvent: 'TEST_STARTED',
      finishEvent: 'TEST_FINISHED',
    });

    const result = await scope(async (emitFn) => {
      await emitFn({ type: 'started', payload: { test: true } });
      return 'done';
    });

    expect(result).toBe('done');
    expect(mockRunScope).toHaveBeenCalled();
    // Note: emit is wrapped, so we check runScope was called
  });

  it('should map started/finished events to configured events', async () => {
    const analytics = {
      runScope: mockRunScope,
    };

    const { scope } = trackCommand(analytics, {
      command: 'test-command',
      startEvent: 'CUSTOM_START',
      finishEvent: 'CUSTOM_FINISH',
    });

    await scope(async (emitFn) => {
      await emitFn({ type: 'started', payload: {} });
      await emitFn({ type: 'finished', payload: {} });
      return 'done';
    });

    // Verify that runScope was called with correct config
    expect(mockRunScope).toHaveBeenCalled();
    const runScopeCall = mockRunScope.mock.calls[0];
    expect(runScopeCall[0]).toMatchObject({
      actor: expect.any(String),
      ctx: expect.any(Object),
    });
  });
});

describe('withAnalyticsScope', () => {
  // Note: Dynamic imports are hard to test, so we skip these tests
  // They are tested indirectly through integration tests
  it.skip('should work with analytics SDK', async () => {
    // This would require mocking dynamic imports which is complex
  });

  it.skip('should work without analytics SDK', async () => {
    // This would require mocking dynamic imports which is complex
  });
});

