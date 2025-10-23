/**
 * @module @kb-labs/cli-commands/commands/bundle/__tests__/explain.spec.ts
 * Tests for bundle explain command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { explain } from '../explain';
import { clearCaches } from '@kb-labs/core-bundle';

describe('Bundle Explain Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-bundle-explain-test-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
    clearCaches();
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
    clearCaches();
  });

  describe('Validation', () => {
    it('should require product flag', async () => {
      const ctx = createMockContext();
      const result = await explain.run(ctx, [], {});
      
      expect(result).toBe(1);
      expect(ctx.presenter.errorCalls).toContain("❌ Product is required\n");
    });

    it('should validate product ID', async () => {
      const ctx = createMockContext();
      const result = await explain.run(ctx, [], { product: 'invalid' });
      
      expect(result).toBe(1);
      expect(ctx.presenter.errorCalls).toContain("❌ Invalid product: invalid\n");
    });

    it('should accept valid product IDs', async () => {
      const validProducts = ['aiReview', 'aiDocs', 'devlink', 'release', 'devkit'];
      
      for (const product of validProducts) {
        const ctx = createMockContext();
        const result = await explain.run(ctx, [], { product });
        
        // Should not fail on validation (may fail on bundle loading, but that's expected)
        expect(result).not.toBe(1);
      }
    });
  });

  describe('Trace Output', () => {
    it('should handle missing workspace config', async () => {
      const ctx = createMockContext();
      const result = await explain.run(ctx, [], { product: 'aiReview' });
      
      expect(result).toBe(2); // ERR_CONFIG_NOT_FOUND exit code
      expect(ctx.presenter.errorCalls.some(call => call.includes('ERR_CONFIG_NOT_FOUND'))).toBe(true);
    });

    it('should display trace information', async () => {
      const ctx = createMockContext();
      const result = await explain.run(ctx, [], { product: 'aiReview' });
      
      // Should attempt to load and display trace (may fail, but should try)
      expect(result).not.toBe(1); // Not a validation error
    });
  });

  describe('Exit Codes', () => {
    it('should return exit code 1 for validation errors', async () => {
      const ctx = createMockContext();
      const result = await explain.run(ctx, [], { product: 'invalid' });
      
      expect(result).toBe(1);
    });

    it('should return exit code 2 for config not found', async () => {
      const ctx = createMockContext();
      const result = await explain.run(ctx, [], { product: 'aiReview' });
      
      expect(result).toBe(2);
    });
  });
});

// Mock context for testing
function createMockContext() {
  const presenter = {
    writeCalls: [] as string[],
    errorCalls: [] as string[],
    
    write: (text: string) => {
      presenter.writeCalls.push(text);
    },
    
    error: (text: string) => {
      presenter.errorCalls.push(text);
    }
  };

  return {
    presenter
  };
}
