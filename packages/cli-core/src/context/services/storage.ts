/**
 * @module @kb-labs/cli-core/context/services/storage
 * Key-value storage service implementation
 */

import type { KeyValueStore } from '../../types/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * File-based key-value store
 */
export class FileKeyValueStore implements KeyValueStore {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || path.join(process.cwd(), '.kb/storage');
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitized = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storageDir, `${sanitized}.txt`);
  }

  async get(key: string): Promise<string | null> {
    const filePath = this.getFilePath(key);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const filePath = this.getFilePath(key);
    fs.writeFileSync(filePath, value, 'utf8');
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  async list(prefix: string): Promise<string[]> {
    const files = fs.readdirSync(this.storageDir);
    const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    return files
      .filter(f => f.startsWith(sanitizedPrefix) && f.endsWith('.txt'))
      .map(f => f.replace(/\.txt$/, ''));
  }
}

