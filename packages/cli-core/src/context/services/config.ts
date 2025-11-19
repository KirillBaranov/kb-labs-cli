/**
 * @module @kb-labs/cli-core/context/services/config
 * Config service implementation
 */

import type { ConfigService } from '../../types/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * JSON config service implementation
 */
export class JsonConfigService implements ConfigService {
  private configPath: string;
  private config: Record<string, unknown> = {};

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'kb-labs.config.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  get<T>(key: string): T | undefined {
    const keys = key.split('.');
    let value: any = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value as T;
  }

  async set(key: string, value: unknown): Promise<void> {
    const keys = key.split('.');
    let current: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!k) {
        continue;
      }
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
    
    // Write to file
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
}

