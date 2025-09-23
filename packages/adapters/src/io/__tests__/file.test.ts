import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileSource } from '../file.js';
import { CliError, CLI_ERROR_CODES } from '@kb-labs/cli-core';

describe('file source', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(tmpdir(), 'kb-labs-test-'));
    testFile = path.join(tempDir, 'test.txt');
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('should read file content successfully', async () => {
    const content = 'Hello, World!';
    await fsp.writeFile(testFile, content, 'utf8');

    const source = fileSource(testFile);
    const result = await source.read();

    expect(result).toBe(content);
  });

  it('should throw CliError when file does not exist', async () => {
    const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
    const source = fileSource(nonExistentFile);

    await expect(source.read()).rejects.toThrow(CliError);
    await expect(source.read()).rejects.toMatchObject({
      code: CLI_ERROR_CODES.E_IO_READ
    });
  });
});
