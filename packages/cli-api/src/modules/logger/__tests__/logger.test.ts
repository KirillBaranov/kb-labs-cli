/**
 * @module @kb-labs/cli-api/modules/logger/__tests__
 * Unit tests for logger module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger } from '@kb-labs/core-platform/adapters';
import { createCliApiLogger, createPlatformLogger, type CliApiLogger, type LogLevel } from '../index.js';

describe('createCliApiLogger', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create logger with all methods', () => {
    const logger = createCliApiLogger('info', { module: 'test' });

    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  describe('log level filtering', () => {
    it('should log nothing when level is silent', () => {
      const logger = createCliApiLogger('silent', { module: 'test' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should log only errors when level is error', () => {
      const logger = createCliApiLogger('error', { module: 'test' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should log errors and warnings when level is warn', () => {
      const logger = createCliApiLogger('warn', { module: 'test' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should log errors, warnings and info when level is info', () => {
      const logger = createCliApiLogger('info', { module: 'test' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should log all messages when level is debug', () => {
      const logger = createCliApiLogger('debug', { module: 'test' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('JSON output format', () => {
    it('should output JSON with message, level, and timestamp', () => {
      const logger = createCliApiLogger('info', { module: 'test' });

      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      const output = consoleSpy.info.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test message');
      expect(parsed.ts).toBeDefined();
      expect(parsed.module).toBe('test');
    });

    it('should include base context in output', () => {
      const logger = createCliApiLogger('info', { module: 'cli-api', version: '1.0.0' });

      logger.info('test');

      const output = consoleSpy.info.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.module).toBe('cli-api');
      expect(parsed.version).toBe('1.0.0');
    });

    it('should merge additional fields with base context', () => {
      const logger = createCliApiLogger('info', { module: 'test' });

      logger.info('test', { requestId: 'abc123', userId: 42 });

      const output = consoleSpy.info.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.module).toBe('test');
      expect(parsed.requestId).toBe('abc123');
      expect(parsed.userId).toBe(42);
    });

    it('should override base context with additional fields', () => {
      const logger = createCliApiLogger('info', { module: 'base' });

      logger.info('test', { module: 'override' });

      const output = consoleSpy.info.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.module).toBe('override');
    });
  });
});

describe('createPlatformLogger', () => {
  let mockPlatformLogger: ILogger;
  let mockCalls: {
    debug: Array<[string, Record<string, unknown>?]>;
    info: Array<[string, Record<string, unknown>?]>;
    warn: Array<[string, Record<string, unknown>?]>;
    error: Array<[string, Error?, Record<string, unknown>?]>;
  };

  beforeEach(() => {
    mockCalls = {
      debug: [],
      info: [],
      warn: [],
      error: [],
    };

    mockPlatformLogger = {
      debug: vi.fn((msg: string, meta?: Record<string, unknown>) => {
        mockCalls.debug.push([msg, meta]);
      }),
      info: vi.fn((msg: string, meta?: Record<string, unknown>) => {
        mockCalls.info.push([msg, meta]);
      }),
      warn: vi.fn((msg: string, meta?: Record<string, unknown>) => {
        mockCalls.warn.push([msg, meta]);
      }),
      error: vi.fn((msg: string, error?: Error, meta?: Record<string, unknown>) => {
        mockCalls.error.push([msg, error, meta]);
      }),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  });

  it('should create logger with all methods', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'test' });

    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it('should delegate debug calls to platform logger', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'cli-api' });

    logger.debug('debug message', { extra: 'data' });

    expect(mockPlatformLogger.debug).toHaveBeenCalledTimes(1);
    expect(mockCalls.debug[0]).toEqual([
      'debug message',
      { module: 'cli-api', extra: 'data' },
    ]);
  });

  it('should delegate info calls to platform logger', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'cli-api' });

    logger.info('info message');

    expect(mockPlatformLogger.info).toHaveBeenCalledTimes(1);
    expect(mockCalls.info[0]).toEqual([
      'info message',
      { module: 'cli-api' },
    ]);
  });

  it('should delegate warn calls to platform logger', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'cli-api' });

    logger.warn('warn message', { count: 5 });

    expect(mockPlatformLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockCalls.warn[0]).toEqual([
      'warn message',
      { module: 'cli-api', count: 5 },
    ]);
  });

  it('should delegate error calls to platform logger with correct signature', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'cli-api' });

    logger.error('error message', { code: 'ERR_001' });

    expect(mockPlatformLogger.error).toHaveBeenCalledTimes(1);
    // ILogger.error signature: (message, error?, meta?)
    // We pass undefined for error and merge context with fields
    expect(mockCalls.error[0]).toEqual([
      'error message',
      undefined,
      { module: 'cli-api', code: 'ERR_001' },
    ]);
  });

  it('should merge base context with additional fields', () => {
    const logger = createPlatformLogger(mockPlatformLogger, {
      module: 'cli-api',
      version: '1.0.0',
    });

    logger.info('test', { requestId: 'xyz' });

    expect(mockCalls.info[0]![1]).toEqual({
      module: 'cli-api',
      version: '1.0.0',
      requestId: 'xyz',
    });
  });

  it('should allow additional fields to override base context', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'base' });

    logger.info('test', { module: 'override' });

    expect(mockCalls.info[0]![1]!.module).toBe('override');
  });

  it('should handle calls without additional fields', () => {
    const logger = createPlatformLogger(mockPlatformLogger, { module: 'cli-api' });

    logger.debug('just a message');

    expect(mockCalls.debug[0]).toEqual([
      'just a message',
      { module: 'cli-api' },
    ]);
  });
});

describe('CliApiLogger type', () => {
  it('should be compatible with both logger implementations', () => {
    const standaloneLogger: CliApiLogger = createCliApiLogger('info', {});

    const mockPlatformLogger: ILogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
    const platformLogger: CliApiLogger = createPlatformLogger(mockPlatformLogger, {});

    // Both should have the same interface
    expect(typeof standaloneLogger.debug).toBe('function');
    expect(typeof standaloneLogger.info).toBe('function');
    expect(typeof standaloneLogger.warn).toBe('function');
    expect(typeof standaloneLogger.error).toBe('function');

    expect(typeof platformLogger.debug).toBe('function');
    expect(typeof platformLogger.info).toBe('function');
    expect(typeof platformLogger.warn).toBe('function');
    expect(typeof platformLogger.error).toBe('function');
  });
});

describe('LogLevel type', () => {
  it('should accept valid log levels', () => {
    const levels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];

    for (const level of levels) {
      const logger = createCliApiLogger(level, {});
      expect(logger).toBeDefined();
    }
  });
});
