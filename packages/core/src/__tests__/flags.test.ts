import { describe, it, expect } from 'vitest';
import { validateCommandFlags } from '../flags';
import { CliError, CLI_ERROR_CODES } from '../errors';

describe('validateCommandFlags', () => {
  const schema = [
    { name: 'mode', type: 'string', choices: ['local', 'workspace', 'auto'] },
    { name: 'dry-run', type: 'boolean' },
    { name: 'json', type: 'boolean' },
    { name: 'verbose', type: 'boolean' },
    { name: 'timeout', type: 'string' }, // no choices
  ];

  describe('valid flags', () => {
    it('should pass validation for valid boolean flags', () => {
      const flags = { 'dry-run': true, json: false };
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });

    it('should pass validation for valid choice flags', () => {
      const flags = { mode: 'local' };
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });

    it('should pass validation for valid string flags without choices', () => {
      const flags = { timeout: '5000' };
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });

    it('should pass validation for mixed valid flags', () => {
      const flags = {
        mode: 'workspace',
        'dry-run': true,
        json: false,
        timeout: '10000'
      };
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });

    it('should pass validation when flags are undefined', () => {
      const flags = { mode: undefined, 'dry-run': undefined };
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });

    it('should pass validation for empty flags object', () => {
      const flags = {};
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });
  });

  describe('invalid boolean flags', () => {
    it('should throw CliError for non-boolean dry-run flag', () => {
      const flags = { 'dry-run': 'true' };
      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
        expect((error as CliError).message).toBe('Flag --dry-run must be a boolean');
      }
    });

    it('should throw CliError for non-boolean json flag', () => {
      const flags = { json: 'false' };
      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
        expect((error as CliError).message).toBe('Flag --json must be a boolean');
      }
    });

    it('should throw CliError for non-boolean verbose flag', () => {
      const flags = { verbose: 1 };
      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
        expect((error as CliError).message).toBe('Flag --verbose must be a boolean');
      }
    });
  });

  describe('invalid choice flags', () => {
    it('should throw CliError for invalid mode choice', () => {
      const flags = { mode: 'invalid' };
      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
        expect((error as CliError).message).toBe('Invalid value for --mode: invalid. Must be one of: local, workspace, auto');
      }
    });

    it('should throw CliError for empty mode choice', () => {
      const flags = { mode: '' };
      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
        expect((error as CliError).message).toBe('Invalid value for --mode: . Must be one of: local, workspace, auto');
      }
    });

    it('should throw CliError for null mode choice', () => {
      const flags = { mode: null };
      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_INVALID_FLAGS);
        expect((error as CliError).message).toBe('Invalid value for --mode: null. Must be one of: local, workspace, auto');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle flags not in schema', () => {
      const flags = { 'unknown-flag': 'value' };
      expect(() => validateCommandFlags(flags, schema)).not.toThrow();
    });

    it('should handle empty schema', () => {
      const flags = { mode: 'local', 'dry-run': true };
      expect(() => validateCommandFlags(flags, [])).not.toThrow();
    });

    it('should handle schema with no choices', () => {
      const simpleSchema = [{ name: 'timeout', type: 'string' }];
      const flags = { timeout: 'any-value' };
      expect(() => validateCommandFlags(flags, simpleSchema)).not.toThrow();
    });

    it('should handle schema with single choice', () => {
      const singleChoiceSchema = [{ name: 'mode', type: 'string', choices: ['local'] }];
      const flags = { mode: 'local' };
      expect(() => validateCommandFlags(flags, singleChoiceSchema)).not.toThrow();

      const invalidFlags = { mode: 'workspace' };
      expect(() => validateCommandFlags(invalidFlags, singleChoiceSchema)).toThrow(CliError);
    });

    it('should handle numeric values for choice validation', () => {
      const numericSchema = [{ name: 'port', type: 'string', choices: ['3000', '8080', '9000'] }];
      const flags = { port: 3000 }; // number, but should be converted to string
      expect(() => validateCommandFlags(flags, numericSchema)).not.toThrow();

      const invalidFlags = { port: 4000 };
      expect(() => validateCommandFlags(invalidFlags, numericSchema)).toThrow(CliError);
    });
  });

  describe('multiple validation errors', () => {
    it('should throw on first validation error encountered', () => {
      const flags = {
        mode: 'invalid',
        'dry-run': 'not-boolean',
        json: 'also-not-boolean'
      };

      expect(() => validateCommandFlags(flags, schema)).toThrow(CliError);

      try {
        validateCommandFlags(flags, schema);
      } catch (error) {
        // Should fail on the first invalid flag (mode)
        expect((error as CliError).message).toContain('--mode');
      }
    });
  });
});
