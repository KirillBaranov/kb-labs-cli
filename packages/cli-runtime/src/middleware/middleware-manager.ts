/**
 * @module @kb-labs/cli-runtime/middleware/middleware-manager
 * Middleware chain management
 */

import type { ExecutionLimits } from '@kb-labs/cli-core';

export type CommandMiddleware = (
  ctx: any,
  next: () => Promise<void>
) => Promise<void>;

export interface MiddlewareConfig {
  name: string;
  priority: number; // lower = runs earlier
  timeoutMs?: number;
  middleware: CommandMiddleware;
}

export class MiddlewareManager {
  private middlewares: MiddlewareConfig[] = [];

  constructor(private limits: ExecutionLimits) {}

  register(config: MiddlewareConfig): void {
    this.middlewares.push(config);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  buildChain(): CommandMiddleware[] {
    return this.middlewares.map(m => m.middleware);
  }

  async execute(ctx: any, handler: () => Promise<void>): Promise<void> {
    const chain = this.buildChain();
    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= chain.length) {
        await handler();
        return;
      }

      const middleware = chain[index++];
      if (!middleware) return;

      await middleware(ctx, next);
    };

    await next();
  }
}

