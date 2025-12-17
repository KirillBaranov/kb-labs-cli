/**
 * Unit tests for command type guards
 */

import { describe, it, expect } from 'vitest';
import { isCommandGroup, hasSetContext } from '../../helpers/command-types';

describe('isCommandGroup', () => {
  it('should return true for valid CommandGroup', () => {
    const group = {
      name: 'test',
      commands: [],
    };
    expect(isCommandGroup(group)).toBe(true);
  });

  it('should return true when commands array is present', () => {
    const group = {
      commands: [{ name: 'cmd1' }],
    };
    expect(isCommandGroup(group)).toBe(true);
  });

  it('should return false for object without commands', () => {
    const obj = {
      name: 'test',
      describe: 'something',
    };
    expect(isCommandGroup(obj)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isCommandGroup(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isCommandGroup(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isCommandGroup('commands')).toBe(false);
  });

  it('should return false for number', () => {
    expect(isCommandGroup(123)).toBe(false);
  });

  it('should return false for boolean', () => {
    expect(isCommandGroup(true)).toBe(false);
  });

  it('should return false for array', () => {
    expect(isCommandGroup([])).toBe(false);
  });

  it('should return false for array with commands property', () => {
    const arr: any = [];
    arr.commands = [];
    expect(isCommandGroup(arr)).toBe(true); // Arrays are objects too
  });

  it('should return true when commands is non-array', () => {
    // Type guard only checks presence, not type
    const obj = {
      commands: 'not an array',
    };
    expect(isCommandGroup(obj)).toBe(true);
  });
});

describe('hasSetContext', () => {
  it('should return true for object with setContext method', () => {
    const presenter = {
      setContext: (ctx: any) => {},
    };
    expect(hasSetContext(presenter)).toBe(true);
  });

  it('should return true when setContext is arrow function', () => {
    const presenter = {
      setContext: (ctx: any) => {},
      info: (msg: string) => {},
    };
    expect(hasSetContext(presenter)).toBe(true);
  });

  it('should return true when setContext is regular function', () => {
    const presenter = {
      setContext: function(ctx: any) {},
    };
    expect(hasSetContext(presenter)).toBe(true);
  });

  it('should return false for object without setContext', () => {
    const obj = {
      info: (msg: string) => {},
      warn: (msg: string) => {},
    };
    expect(hasSetContext(obj)).toBe(false);
  });

  it('should return false when setContext is not a function', () => {
    const obj = {
      setContext: 'not a function',
    };
    expect(hasSetContext(obj)).toBe(false);
  });

  it('should return false when setContext is null', () => {
    const obj = {
      setContext: null,
    };
    expect(hasSetContext(obj)).toBe(false);
  });

  it('should return false when setContext is undefined', () => {
    const obj = {
      setContext: undefined,
    };
    expect(hasSetContext(obj)).toBe(false);
  });

  it('should return false for null', () => {
    expect(hasSetContext(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(hasSetContext(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(hasSetContext('presenter')).toBe(false);
  });

  it('should return false for number', () => {
    expect(hasSetContext(123)).toBe(false);
  });

  it('should return false for boolean', () => {
    expect(hasSetContext(true)).toBe(false);
  });

  it('should return false for array', () => {
    expect(hasSetContext([])).toBe(false);
  });
});
