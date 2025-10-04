// Simplified profile implementation for demonstration
// This is a temporary implementation until @kb-labs/core-profiles is fixed

export interface ProfilesConfig {
  strict?: boolean;
  defaultName?: string;
  profiles?: Record<string, any>;
}

export interface ResolvedProfile {
  name: string;
  kind: string;
  scope: string;
  products: Record<string, any>;
  files: string[];
  meta?: Record<string, any>;
}

export interface ResolveOptions {
  name?: string;
  strict?: boolean;
  cwd?: string;
}

export interface ProfileService {
  resolveProfile(opts: ResolveOptions): Promise<ResolvedProfile>;
}

export function createProfileServiceFromConfig(config: ProfilesConfig, cwd: string): ProfileService {
  return {
    async resolveProfile(opts: ResolveOptions): Promise<ResolvedProfile> {
      const { name = 'default', strict: _strict = false } = opts;

      // Simple mock implementation
      return {
        name,
        kind: 'project',
        scope: 'local',
        products: {
          'example-product': {
            config: 'example-config'
          }
        },
        files: ['package.json', 'README.md'],
        meta: {
          resolveTime: Date.now(),
          cwd
        }
      };
    }
  };
}

export function resolveConfig(_opts: { cwd?: string }): Promise<{ profiles: ProfilesConfig }> {
  return Promise.resolve({
    profiles: {
      strict: false,
      defaultName: 'default',
      profiles: {}
    }
  });
}

export function getLogger(name: string, opts?: { level?: string }) {
  return {
    debug: (msg: string, meta?: any) => {
      if (opts?.level === 'debug') {
        console.log(`[${name}] DEBUG: ${msg}`, meta || '');
      }
    },
    info: (msg: string, meta?: any) => {
      console.log(`[${name}] INFO: ${msg}`, meta || '');
    },
    error: (msg: string, meta?: any) => {
      console.error(`[${name}] ERROR: ${msg}`, meta || '');
    }
  };
}
