/**
 * @module @kb-labs/cli-commands/init/__tests__/e2e
 * End-to-end test for kb init --yes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initAll as coreInitAll } from '@kb-labs/core-bundle';

describe('kb init --yes (e2e)', () => {
  let tmpDir: string;
  
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `kb-init-e2e-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  
  it('initializes complete workspace from empty directory', async () => {
    // Simulate: kb init --yes
    const result = await coreInitAll({
      cwd: tmpDir,
      format: 'yaml',
      products: ['aiReview'],
      profileKey: 'default',
      profileRef: 'node-ts-lib',
      presetRef: null,
      scaffoldLocalProfile: true,
      policyBundle: null,
      dryRun: false,
      force: false,
    });
    
    // Verify summary stats
    expect(result.stats.created).toBeGreaterThan(0);
    expect(result.stats.conflicts).toBe(0);
    
    // 1. Verify kb-labs.config.yaml was created
    const configPath = path.join(tmpDir, 'kb-labs.config.yaml');
    const configContent = await fs.readFile(configPath, 'utf-8');
    expect(configContent).toContain('schemaVersion: "1.0"');
    expect(configContent).toContain('profiles:');
    expect(configContent).toContain('default:');
    expect(configContent).toContain('./.kb/profiles/node-ts-lib');
    
    // 2. Verify profile scaffold was created
    const profileJsonPath = path.join(tmpDir, '.kb', 'profiles', 'node-ts-lib', 'profile.json');
    const profileContent = await fs.readFile(profileJsonPath, 'utf-8');
    const profileData = JSON.parse(profileContent);
    
    expect(profileData.schemaVersion).toBe('1.0');
    expect(profileData.name).toBe('node-ts-lib');
    expect(profileData.exports).toHaveProperty('ai-review');
    expect(profileData.defaults).toHaveProperty('ai-review');
    
    // 3. Verify defaults file exists
    const defaultsPath = path.join(tmpDir, '.kb', 'profiles', 'node-ts-lib', 'defaults', 'ai-review.json');
    const defaultsContent = await fs.readFile(defaultsPath, 'utf-8');
    const defaults = JSON.parse(defaultsContent);
    expect(defaults).toHaveProperty('include');
    expect(defaults).toHaveProperty('exclude');
    expect(defaults).toHaveProperty('providers');
    
    // 4. Verify artifacts were created
    const rulesPath = path.join(tmpDir, '.kb', 'profiles', 'node-ts-lib', 'artifacts', 'ai-review', 'rules.yml');
    const rulesContent = await fs.readFile(rulesPath, 'utf-8');
    expect(rulesContent).toContain('version: 1');
    
    const promptPath = path.join(tmpDir, '.kb', 'profiles', 'node-ts-lib', 'artifacts', 'ai-review', 'prompts', 'review.md');
    const promptContent = await fs.readFile(promptPath, 'utf-8');
    expect(promptContent).toContain('Code Review');
    
    // 5. Verify product config file was created
    const productConfigPath = path.join(tmpDir, '.kb', 'ai-review', 'ai-review.config.json');
    const productConfigContent = await fs.readFile(productConfigPath, 'utf-8');
    expect(productConfigContent.trim()).toBe('{}');
    
    // 6. Verify lockfile was created
    const lockfilePath = path.join(tmpDir, '.kb', 'lock.json');
    const lockfileContent = await fs.readFile(lockfilePath, 'utf-8');
    const lockfileData = JSON.parse(lockfileContent);
    
    expect(lockfileData.schemaVersion).toBe('1.0');
    expect(lockfileData.generatedAt).toBeTruthy();
    expect(lockfileData.hashes).toBeDefined();
    expect(lockfileData.profile).toContain('./.kb/profiles/node-ts-lib');
    
    // 7. Verify profile.json validates (basic structure check)
    expect(profileData).toMatchObject({
      schemaVersion: '1.0',
      name: expect.any(String),
      version: expect.any(String),
      extends: expect.any(Array),
      exports: expect.any(Object),
      defaults: expect.any(Object),
    });
  });
  
  it('is idempotent - second run skips unchanged files', async () => {
    // First run
    await coreInitAll({
      cwd: tmpDir,
      format: 'yaml',
      products: ['aiReview'],
      profileKey: 'default',
      profileRef: 'node-ts-lib',
      scaffoldLocalProfile: true,
      dryRun: false,
    });
    
    // Second run with same options
    const result2 = await coreInitAll({
      cwd: tmpDir,
      format: 'yaml',
      products: ['aiReview'],
      profileKey: 'default',
      profileRef: 'node-ts-lib',
      scaffoldLocalProfile: false, // Don't re-scaffold
      dryRun: false,
    });
    
    // Most things should be skipped
    expect(result2.stats.skipped).toBeGreaterThan(0);
  });
});

