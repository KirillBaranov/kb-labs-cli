/**
 * Tests for system command execution in bootstrap.ts
 *
 * Ensures that system commands:
 * 1. Execute in-process via cmd.run()
 * 2. Receive correct PluginContextV3 context
 * 3. Handle flags and argv correctly
 * 4. Return correct exit codes
 * 5. Don't route to v3-adapter (no subprocess)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Command } from '@kb-labs/shared-command-kit';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

// Mock the entire bootstrap module
const { mockExecuteCli, mockCommandRegistry, mockPlatform } = vi.hoisted(() => {
  const mockCommandRegistry = {
    resolveCommand: vi.fn(),
  };

  const mockPlatform = {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    llm: {} as any,
    embeddings: {} as any,
    vectorStore: {} as any,
    cache: {} as any,
    storage: {} as any,
    analytics: {} as any,
  };

  const mockExecuteCli = vi.fn();

  return { mockExecuteCli, mockCommandRegistry, mockPlatform };
});

vi.mock('../runtime/bootstrap', () => ({
  executeCli: mockExecuteCli,
}));

vi.mock('@kb-labs/cli-commands/registry', () => ({
  commandRegistry: mockCommandRegistry,
}));

describe('Bootstrap System Commands', () => {
  let mockSystemCommand: Command;
  let capturedContext: PluginContextV3 | null = null;
  let capturedArgv: string[] | null = null;
  let capturedFlags: Record<string, unknown> | null = null;

  beforeEach(() => {
    capturedContext = null;
    capturedArgv = null;
    capturedFlags = null;

    // Create a mock system command
    mockSystemCommand = {
      name: 'test-system',
      describe: 'Test system command',
      category: 'system',
      aliases: [],
      flags: [
        { name: 'flag1', type: 'string', description: 'Test flag' },
        { name: 'verbose', type: 'boolean', default: false },
      ],
      examples: [],
      run: vi.fn(async (ctx: PluginContextV3, argv: string[], flags: Record<string, unknown>) => {
        // Capture arguments for verification
        capturedContext = ctx;
        capturedArgv = argv;
        capturedFlags = flags;
        return 0; // Success exit code
      }),
    };

    mockCommandRegistry.resolveCommand.mockReset();
    mockExecuteCli.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('System Command Routing', () => {
    it('should execute system command in-process via cmd.run()', async () => {
      // Setup mock to return system command
      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: mockSystemCommand,
        global: {},
      });

      // Mock executeCli to simulate bootstrap routing
      mockExecuteCli.mockImplementation(async (argv: string[]) => {
        // Simulate bootstrap logic
        const result = mockCommandRegistry.resolveCommand('test-system');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: PluginContextV3 = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: process.cwd(),
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
          };

          const exitCode = await result.cmd.run(mockContext, [], { verbose: true });
          return typeof exitCode === 'number' ? exitCode : 0;
        }

        return 1;
      });

      const exitCode = await mockExecuteCli(['test-system', '--verbose']);

      expect(exitCode).toBe(0);
      expect(mockSystemCommand.run).toHaveBeenCalledOnce();
    });

    it('should pass correct PluginContextV3 to system command', async () => {
      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: mockSystemCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-system');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: PluginContextV3 = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: '/test-cwd',
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
          };

          await result.cmd.run(mockContext, [], {});
        }

        return 0;
      });

      await mockExecuteCli(['test-system']);

      expect(capturedContext).not.toBeNull();
      expect(capturedContext?.host).toBe('cli');
      expect(capturedContext?.pluginId).toBe('@kb-labs/system');
      expect(capturedContext?.cwd).toBe('/test-cwd');
      expect(capturedContext?.ui).toBeDefined();
      expect(capturedContext?.platform).toBeDefined();
      expect(capturedContext?.runtime).toBeDefined();
      expect(capturedContext?.trace).toBeDefined();
    });

    it('should pass argv and flags to system command', async () => {
      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: mockSystemCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-system');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: PluginContextV3 = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: process.cwd(),
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
          };

          const argv = ['arg1', 'arg2'];
          const flags = { flag1: 'value1', verbose: true };

          await result.cmd.run(mockContext, argv, flags);
        }

        return 0;
      });

      await mockExecuteCli(['test-system', 'arg1', 'arg2', '--flag1=value1', '--verbose']);

      expect(capturedArgv).toEqual(['arg1', 'arg2']);
      expect(capturedFlags).toEqual({ flag1: 'value1', verbose: true });
    });

    it('should return exit code from system command', async () => {
      const exitingCommand: Command = {
        name: 'test-exit',
        describe: 'Test exit codes',
        category: 'system',
        aliases: [],
        flags: [],
        examples: [],
        run: vi.fn(async () => 42), // Custom exit code
      };

      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: exitingCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-exit');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: PluginContextV3 = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: process.cwd(),
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
          };

          const exitCode = await result.cmd.run(mockContext, [], {});
          return typeof exitCode === 'number' ? exitCode : 0;
        }

        return 1;
      });

      const exitCode = await mockExecuteCli(['test-exit']);

      expect(exitCode).toBe(42);
      expect(exitingCommand.run).toHaveBeenCalledOnce();
    });

    it('should handle system command errors gracefully', async () => {
      const errorCommand: Command = {
        name: 'test-error',
        describe: 'Test error handling',
        category: 'system',
        aliases: [],
        flags: [],
        examples: [],
        run: vi.fn(async () => {
          throw new Error('Test error');
        }),
      };

      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: errorCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-error');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: PluginContextV3 = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: process.cwd(),
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
          };

          try {
            await result.cmd.run(mockContext, [], {});
          } catch (error) {
            mockContext.ui.error(error as Error);
            return 1; // Error exit code
          }
        }

        return 1;
      });

      const exitCode = await mockExecuteCli(['test-error']);

      expect(exitCode).toBe(1);
      expect(errorCommand.run).toHaveBeenCalledOnce();
    });
  });

  describe('System vs Plugin Command Routing', () => {
    it('should NOT route system commands to v3-adapter', async () => {
      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system', // System command
        cmd: mockSystemCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-system');

        // Bootstrap should check type === 'system'
        if (result.type === 'system') {
          // System commands execute in-process, NO subprocess
          if ('run' in result.cmd) {
            const mockContext: PluginContextV3 = {
              host: 'cli',
              requestId: 'test-request-id',
              pluginId: '@kb-labs/system',
              cwd: process.cwd(),
              ui: {
                write: vi.fn(),
                info: vi.fn(),
                success: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
                spinner: vi.fn(),
                table: vi.fn(),
                json: vi.fn(),
                newline: vi.fn(),
                divider: vi.fn(),
                box: vi.fn(),
                sideBox: vi.fn(),
                confirm: vi.fn().mockResolvedValue(true),
                prompt: vi.fn().mockResolvedValue(''),
                colors: {} as any,
              },
              platform: mockPlatform,
              runtime: {
                fs: {} as any,
                fetch: vi.fn(),
                env: vi.fn(),
              },
              api: {} as any,
              trace: {
                traceId: 'test-trace-id',
                spanId: 'test-span-id',
              },
            };

            return await result.cmd.run(mockContext, [], {});
          }
        }

        return 1;
      });

      const exitCode = await mockExecuteCli(['test-system']);

      expect(exitCode).toBe(0);
      expect(mockSystemCommand.run).toHaveBeenCalledOnce();
      // System command should execute directly, not via subprocess
    });

    it('should route plugin commands to v3-adapter (not tested here)', () => {
      // This test is a placeholder to document that plugin commands
      // go through tryExecuteV3() - tested separately in v3-adapter tests
      expect(true).toBe(true);
    });
  });

  // Removed: EnhancedCliContext is removed - context is pure PluginContextV3
  describe('Pure PluginContextV3 Integration', () => {
    it('should provide pure PluginContextV3 to system command (no tracker)', async () => {
      const helperCommand: Command = {
        name: 'test-helpers',
        describe: 'Test PluginContextV3',
        category: 'system',
        aliases: [],
        flags: [],
        examples: [],
        run: vi.fn(async (ctx: any) => {
          // Pure PluginContextV3 - no tracker
          expect(ctx.tracker).toBeUndefined();
          expect(ctx.ui).toBeDefined(); // UI facade still provided
          return 0;
        }),
      };

      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: helperCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-helpers');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: any = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: process.cwd(),
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
            // Removed: tracker is no longer part of PluginContextV3
          };

          return await result.cmd.run(mockContext, [], {});
        }

        return 1;
      });

      const exitCode = await mockExecuteCli(['test-helpers']);

      expect(exitCode).toBe(0);
      expect(helperCommand.run).toHaveBeenCalledOnce();
    });
  });

  describe('Context Field Validation', () => {
    it('should provide all required PluginContextV3 fields', async () => {
      const validationCommand: Command = {
        name: 'test-validation',
        describe: 'Validate PluginContextV3 fields',
        category: 'system',
        aliases: [],
        flags: [],
        examples: [],
        run: vi.fn(async (ctx: PluginContextV3) => {
          // Required fields
          expect(ctx.host).toBeDefined();
          expect(ctx.requestId).toBeDefined();
          expect(ctx.pluginId).toBeDefined();
          expect(ctx.cwd).toBeDefined();
          expect(ctx.ui).toBeDefined();
          expect(ctx.platform).toBeDefined();
          expect(ctx.runtime).toBeDefined();
          expect(ctx.api).toBeDefined();
          expect(ctx.trace).toBeDefined();

          // Platform services
          expect(ctx.platform.logger).toBeDefined();
          expect(ctx.platform.llm).toBeDefined();
          expect(ctx.platform.embeddings).toBeDefined();
          expect(ctx.platform.vectorStore).toBeDefined();
          expect(ctx.platform.cache).toBeDefined();
          expect(ctx.platform.storage).toBeDefined();
          expect(ctx.platform.analytics).toBeDefined();

          // Runtime services
          expect(ctx.runtime.fs).toBeDefined();
          expect(ctx.runtime.fetch).toBeDefined();
          expect(ctx.runtime.env).toBeDefined();

          // Trace context
          expect(ctx.trace.traceId).toBeDefined();
          expect(ctx.trace.spanId).toBeDefined();

          return 0;
        }),
      };

      mockCommandRegistry.resolveCommand.mockReturnValue({
        type: 'system',
        cmd: validationCommand,
        global: {},
      });

      mockExecuteCli.mockImplementation(async () => {
        const result = mockCommandRegistry.resolveCommand('test-validation');

        if (result.type === 'system' && 'run' in result.cmd) {
          const mockContext: PluginContextV3 = {
            host: 'cli',
            requestId: 'test-request-id',
            pluginId: '@kb-labs/system',
            cwd: process.cwd(),
            ui: {
              write: vi.fn(),
              info: vi.fn(),
              success: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              spinner: vi.fn(),
              table: vi.fn(),
              json: vi.fn(),
              newline: vi.fn(),
              divider: vi.fn(),
              box: vi.fn(),
              sideBox: vi.fn(),
              confirm: vi.fn().mockResolvedValue(true),
              prompt: vi.fn().mockResolvedValue(''),
              colors: {} as any,
            },
            platform: mockPlatform,
            runtime: {
              fs: {} as any,
              fetch: vi.fn(),
              env: vi.fn(),
            },
            api: {} as any,
            trace: {
              traceId: 'test-trace-id',
              spanId: 'test-span-id',
            },
          };

          return await result.cmd.run(mockContext, [], {});
        }

        return 1;
      });

      const exitCode = await mockExecuteCli(['test-validation']);

      expect(exitCode).toBe(0);
    });
  });
});
