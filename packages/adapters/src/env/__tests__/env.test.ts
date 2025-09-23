import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { envBool, envNumber, envString, readEnv } from '../env';
import { CliError, CLI_ERROR_CODES } from '@kb-labs/cli-core';

describe('env helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should read environment variables successfully', () => {
    process.env.TEST_BOOL = 'true';
    process.env.TEST_NUMBER = '42';
    process.env.TEST_STRING = 'hello';

    expect(envBool('TEST_BOOL')).toBe(true);
    expect(envNumber('TEST_NUMBER')).toBe(42);
    expect(envString('TEST_STRING')).toBe('hello');
  });

  it('should throw CliError when required env var is missing', () => {
    expect(() => envString('REQUIRED_VAR')).toThrow(CliError);
    try {
      envString('REQUIRED_VAR');
      expect.fail('Expected CliError to be thrown');
    } catch (error: any) {
      expect(error.code).toBe(CLI_ERROR_CODES.E_ENV_MISSING_VAR);
    }

    expect(() => envNumber('REQUIRED_NUMBER')).toThrow(CliError);
    try {
      envNumber('REQUIRED_NUMBER');
      expect.fail('Expected CliError to be thrown');
    } catch (error: any) {
      expect(error.code).toBe(CLI_ERROR_CODES.E_ENV_MISSING_VAR);
    }
  });

  it('should throw CliError when env var has invalid number value', () => {
    process.env.INVALID_NUMBER = 'not-a-number';

    expect(() => envNumber('INVALID_NUMBER')).toThrow(CliError);
    try {
      envNumber('INVALID_NUMBER');
      expect.fail('Expected CliError to be thrown');
    } catch (error: any) {
      expect(error.code).toBe(CLI_ERROR_CODES.E_ENV_MISSING_VAR);
    }
  });
});
