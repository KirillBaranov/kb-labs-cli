import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ensureDir, writeText, writeJson } from '../fs-artifacts';
import { CliError, CLI_ERROR_CODES } from '@kb-labs/cli-core';

describe('fs artifacts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(tmpdir(), 'kb-labs-test-'));
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('should create directory and write files successfully', async () => {
    const testDir = path.join(tempDir, 'subdir');
    const textFile = path.join(testDir, 'test.txt');
    const jsonFile = path.join(testDir, 'test.json');

    await ensureDir(testDir);
    await writeText(textFile, 'Hello, World!');
    await writeJson(jsonFile, { message: 'test' });

    expect(await fsp.readFile(textFile, 'utf8')).toBe('Hello, World!');
    expect(JSON.parse(await fsp.readFile(jsonFile, 'utf8'))).toEqual({ message: 'test' });
  });

  it('should throw CliError when write fails due to permissions', async () => {
    const readOnlyDir = path.join(tempDir, 'readonly');
    await fsp.mkdir(readOnlyDir, { mode: 0o444 }); // read-only

    const testFile = path.join(readOnlyDir, 'test.txt');

    await expect(writeText(testFile, 'test')).rejects.toThrow(CliError);
    await expect(writeText(testFile, 'test')).rejects.toMatchObject({
      code: CLI_ERROR_CODES.E_IO_WRITE
    });
  });
});
