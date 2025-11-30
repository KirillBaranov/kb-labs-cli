import { describe, it, expect } from 'vitest';
import {
  CLI_ERROR_CODES,
  EXIT_CODES,
  CliError,
  mapCliErrorToExitCode,
  isCliError,
  serializeCliError
} from '../errors';

describe('CLI Error System', () => {
  describe('CLI_ERROR_CODES', () => {
    it('should include all expected error codes', () => {
      expect(CLI_ERROR_CODES.E_IO_READ).toBe('E_IO_READ');
      expect(CLI_ERROR_CODES.E_IO_WRITE).toBe('E_IO_WRITE');
      expect(CLI_ERROR_CODES.E_ENV_MISSING_VAR).toBe('E_ENV_MISSING_VAR');
      expect(CLI_ERROR_CODES.E_DISCOVERY_CONFIG).toBe('E_DISCOVERY_CONFIG');
      expect(CLI_ERROR_CODES.E_TELEMETRY_EMIT).toBe('E_TELEMETRY_EMIT');
      expect(CLI_ERROR_CODES.E_INVALID_FLAGS).toBe('E_INVALID_FLAGS');
      expect(CLI_ERROR_CODES.E_PREFLIGHT_CANCELLED).toBe('E_PREFLIGHT_CANCELLED');
    });
  });

  describe('EXIT_CODES', () => {
    it('should have correct standard exit codes', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.ERROR).toBe(1);
      expect(EXIT_CODES.PREFLIGHT_CANCELLED).toBe(2);
      expect(EXIT_CODES.INVALID_FLAGS).toBe(3);
    });

    it('should have legacy sysexits.h codes', () => {
      expect(EXIT_CODES.IO).toBe(74);
      expect(EXIT_CODES.SOFTWARE).toBe(70);
      expect(EXIT_CODES.CONFIG).toBe(78);
    });
  });

  describe('mapCliErrorToExitCode', () => {
    it('should map E_INVALID_FLAGS to exit code 3', () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_INVALID_FLAGS)).toBe(EXIT_CODES.INVALID_FLAGS);
    });

    it('should map E_PREFLIGHT_CANCELLED to exit code 2', () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_PREFLIGHT_CANCELLED)).toBe(EXIT_CODES.PREFLIGHT_CANCELLED);
    });

    it('should map config errors to exit code 78', () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_DISCOVERY_CONFIG)).toBe(EXIT_CODES.CONFIG);
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_ENV_MISSING_VAR)).toBe(EXIT_CODES.CONFIG);
    });

    it('should map IO errors to exit code 74', () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_IO_READ)).toBe(EXIT_CODES.IO);
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_IO_WRITE)).toBe(EXIT_CODES.IO);
    });

    it('should map telemetry errors to exit code 70', () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_TELEMETRY_EMIT)).toBe(EXIT_CODES.SOFTWARE);
    });

    it('should default to exit code 1 for unknown errors', () => {
      // Test with a mock error code that doesn't exist
      const mockCode = 'E_UNKNOWN' as any;
      expect(mapCliErrorToExitCode(mockCode)).toBe(EXIT_CODES.ERROR);
    });
  });

  describe('CliError', () => {
    it('should create error with code and message', () => {
      const error = new CliError(CLI_ERROR_CODES.E_INVALID_FLAGS, 'Invalid flag value');
      expect(error.code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
      expect(error.message).toBe('Invalid flag value');
      expect(error.name).toBe('CliError');
    });

    it('should create error with details', () => {
      const details = { flag: 'mode', value: 'invalid' };
      const error = new CliError(CLI_ERROR_CODES.E_INVALID_FLAGS, 'Invalid flag', details);
      expect(error.details).toEqual(details);
    });

    it('should have proper stack trace', () => {
      const error = new CliError(CLI_ERROR_CODES.E_INVALID_FLAGS, 'Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CliError');
    });
  });

  describe('isCliError', () => {
    it('should identify CliError instances', () => {
      const error = new CliError(CLI_ERROR_CODES.E_INVALID_FLAGS, 'Test');
      expect(isCliError(error)).toBe(true);
    });

    it('should reject non-CliError objects', () => {
      expect(isCliError(new Error('Regular error'))).toBe(false);
      expect(isCliError({ code: 'E_INVALID_FLAGS' })).toBe(false);
      expect(isCliError(null)).toBe(false);
      expect(isCliError(undefined)).toBe(false);
      expect(isCliError('string')).toBe(false);
    });
  });

  describe('serializeCliError', () => {
    it('should serialize CliError correctly', () => {
      const error = new CliError(CLI_ERROR_CODES.E_INVALID_FLAGS, 'Test error', { flag: 'mode' });
      const serialized = serializeCliError(error);

      expect(serialized).toEqual({
        name: 'CliError',
        message: 'Test error',
        code: 'E_INVALID_FLAGS',
        details: { flag: 'mode' }
      });
    });

    it('should serialize regular Error', () => {
      const error = new Error('Regular error');
      const serialized = serializeCliError(error);

      expect(serialized).toEqual({
        name: 'Error',
        message: 'Regular error'
      });
    });

    it('should include stack trace when requested', () => {
      const error = new CliError(CLI_ERROR_CODES.E_INVALID_FLAGS, 'Test error');
      const serialized = serializeCliError(error, { includeStack: true });

      expect(serialized.stack).toBeDefined();
      expect(serialized.stack).toContain('CliError');
    });

    it('should handle unknown error types', () => {
      const serialized = serializeCliError('string error');

      expect(serialized).toEqual({
        name: 'Error',
        message: 'string error'
      });
    });
  });
});