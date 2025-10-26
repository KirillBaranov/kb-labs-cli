/**
 * Tests for command execution with JSON mode and exit codes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCommand } from '../run.js';
import type { RegisteredCommand } from '../types.js';

describe('runCommand', () => {
  const mockCtx = {
    presenter: {
      json: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute available command successfully', async () => {
    const mockCommand = {
      run: vi.fn().mockResolvedValue(0),
    };

    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => mockCommand,
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, ['arg1'], { verbose: false });

    expect(result).toBe(0);
    expect(mockCommand.run).toHaveBeenCalledWith(mockCtx, ['arg1'], { verbose: false });
  });

  it('should return exit code 2 for unavailable command in JSON mode', async () => {
    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => ({ run: async () => 0 }),
      },
      available: false,
      source: 'workspace',
      unavailableReason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], { json: true });

    expect(result).toBe(2);
    expect(mockCtx.presenter.json).toHaveBeenCalledWith({
      ok: false,
      available: false,
      command: 'test:command',
      reason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
    });
  });

  it('should return exit code 2 for unavailable command in text mode', async () => {
    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => ({ run: async () => 0 }),
      },
      available: false,
      source: 'workspace',
      unavailableReason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], { verbose: false });

    expect(result).toBe(2);
    expect(mockCtx.presenter.warn).toHaveBeenCalledWith('test:command unavailable: Missing dependency: @kb-labs/missing-package');
    expect(mockCtx.presenter.info).toHaveBeenCalledWith('Run: kb devlink apply');
  });

  it('should show verbose output for unavailable command', async () => {
    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => ({ run: async () => 0 }),
      },
      available: false,
      source: 'workspace',
      unavailableReason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], { verbose: true });

    expect(result).toBe(2);
    expect(mockCtx.presenter.warn).toHaveBeenCalledWith('Command unavailable: test:command');
    expect(mockCtx.presenter.warn).toHaveBeenCalledWith('Reason: Missing dependency: @kb-labs/missing-package');
    expect(mockCtx.presenter.info).toHaveBeenCalledWith('Hint: Run: kb devlink apply');
  });

  it('should return exit code 1 for invalid command module', async () => {
    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => ({ run: async () => 0 }), // Valid module
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], {});

    expect(result).toBe(1);
    expect(mockCtx.presenter.error).toHaveBeenCalledWith('Invalid command module for test:command');
  });

  it('should pass global flags to command', async () => {
    const mockCommand = {
      run: vi.fn().mockResolvedValue(0),
    };

    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => mockCommand,
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const flags = {
      json: true,
      verbose: true,
      quiet: false,
      help: false,
      version: false,
      onlyAvailable: false,
      noCache: false,
    };

    await runCommand(registeredCmd, mockCtx, ['arg1'], flags);

    expect(mockCommand.run).toHaveBeenCalledWith(mockCtx, ['arg1'], flags);
  });

  it('should handle command returning number', async () => {
    const mockCommand = {
      run: vi.fn().mockResolvedValue(42),
    };

    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => mockCommand,
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], {});

    expect(result).toBe(42);
  });

  it('should handle command returning void', async () => {
    const mockCommand = {
      run: vi.fn().mockResolvedValue(undefined),
    };

    const registeredCmd: RegisteredCommand = {
      manifest: {
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => mockCommand,
      },
      available: true,
      source: 'workspace',
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], {});

    expect(result).toBe(0);
  });
});
