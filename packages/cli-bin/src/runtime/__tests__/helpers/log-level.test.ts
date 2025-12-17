/**
 * Unit tests for log level helper
 */

import { describe, it, expect } from 'vitest';
import { resolveLogLevel } from '../../helpers/log-level';

describe('resolveLogLevel', () => {
  describe('Valid log levels', () => {
    it('should accept "trace"', () => {
      expect(resolveLogLevel('trace')).toBe('trace');
    });

    it('should accept "debug"', () => {
      expect(resolveLogLevel('debug')).toBe('debug');
    });

    it('should accept "info"', () => {
      expect(resolveLogLevel('info')).toBe('info');
    });

    it('should accept "warn"', () => {
      expect(resolveLogLevel('warn')).toBe('warn');
    });

    it('should accept "error"', () => {
      expect(resolveLogLevel('error')).toBe('error');
    });

    it('should accept "silent"', () => {
      expect(resolveLogLevel('silent')).toBe('silent');
    });
  });

  describe('Case insensitivity', () => {
    it('should accept uppercase', () => {
      expect(resolveLogLevel('DEBUG')).toBe('debug');
      expect(resolveLogLevel('INFO')).toBe('info');
      expect(resolveLogLevel('ERROR')).toBe('error');
    });

    it('should accept mixed case', () => {
      expect(resolveLogLevel('DeBuG')).toBe('debug');
      expect(resolveLogLevel('InFo')).toBe('info');
    });
  });

  describe('Invalid inputs', () => {
    it('should return "silent" for invalid string', () => {
      expect(resolveLogLevel('invalid')).toBe('silent');
    });

    it('should return "silent" for undefined', () => {
      expect(resolveLogLevel(undefined)).toBe('silent');
    });

    it('should return "silent" for null', () => {
      expect(resolveLogLevel(null)).toBe('silent');
    });

    it('should return "silent" for empty string', () => {
      expect(resolveLogLevel('')).toBe('silent');
    });

    it('should return "silent" for number', () => {
      expect(resolveLogLevel(123)).toBe('silent');
    });

    it('should return "silent" for boolean', () => {
      expect(resolveLogLevel(true)).toBe('silent');
      expect(resolveLogLevel(false)).toBe('silent');
    });

    it('should return "silent" for object', () => {
      expect(resolveLogLevel({})).toBe('silent');
    });

    it('should return "silent" for array', () => {
      expect(resolveLogLevel([])).toBe('silent');
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace around valid level', () => {
      // String() converts to string, then toLowerCase, so whitespace is preserved
      expect(resolveLogLevel(' debug ')).toBe('silent'); // Not trimmed
    });

    it('should handle partial matches as invalid', () => {
      expect(resolveLogLevel('deb')).toBe('silent');
      expect(resolveLogLevel('debugging')).toBe('silent');
    });
  });
});
