/**
 * @module @kb-labs/cli-command-kit/analytics/track
 * Analytics tracking helpers for commands
 */

import type { TrackingConfig, TrackingResult, AnalyticsEmit, AnalyticsScope } from './types.js';
// CliContext type is used in JSDoc comments and type inference
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CliContext } from '@kb-labs/cli-core/public';

/**
 * Create analytics tracking helper
 * 
 * This function provides a convenient wrapper around analytics SDK.
 * It can work with ctx.analytics if available, or use runScope directly.
 * 
 * @example
 * ```typescript
 * const { emit, scope } = trackCommand(ctx.analytics, {
 *   command: 'release:run',
 *   startEvent: 'RELEASE_RUN_STARTED',
 *   finishEvent: 'RELEASE_RUN_FINISHED',
 * });
 * 
 * return await scope(async () => {
 *   await emit('started', { flags });
 *   // ... business logic
 *   await emit('finished', { result: 'success' });
 * });
 * ```
 */
export function trackCommand(
  analytics: unknown,
  config: TrackingConfig
): TrackingResult {
  const { command, startEvent, finishEvent, actor, context } = config;

  // Try to use runScope from analytics SDK if available
  let runScope: AnalyticsScope | null = null;
  
  if (analytics && typeof analytics === 'object' && 'runScope' in analytics) {
    runScope = (analytics as { runScope: AnalyticsScope }).runScope;
  }
  // Note: If analytics SDK is needed, it should be imported at the top level
  // or passed via ctx.analytics. We don't use require() in ES modules.

  // Create emit function
  const emit: AnalyticsEmit = async (_event: Partial<{ type: string; payload?: unknown }>) => {
    // If runScope is not available, emit is a no-op
    // The actual emit will be called within scope
    return Promise.resolve();
  };

  // Create scope function
  const scope: AnalyticsScope = async <T>(fn: (emit: AnalyticsEmit) => Promise<T>): Promise<T> => {
    if (runScope) {
      // Use runScope from analytics SDK
      // Note: runScope signature may vary, so we use type assertion
      return await (runScope as (config: unknown, fn: (emit: AnalyticsEmit) => Promise<T>) => Promise<T>)(
        {
          actor: actor || 'cli',
          ctx: context || {},
        },
        async (emitFn: AnalyticsEmit) => {
          // Wrap emit to handle started/finished events
          const wrappedEmit: AnalyticsEmit = async (event) => {
            if (event.type === 'started' || event.type === 'finished') {
              // Map to configured event types
              const mappedType = event.type === 'started' ? startEvent : finishEvent;
              return await emitFn({
                type: mappedType,
                payload: event.payload,
              });
            }
            return await emitFn(event);
          };
          
          return await fn(wrappedEmit);
        }
      );
    } else {
      // No-op implementation if analytics is not available
      return await fn(emit);
    }
  };

  // Helper to emit started/finished events
  const emitEvent = async (
    eventType: 'started' | 'finished',
    payload?: Record<string, unknown>
  ): Promise<void> => {
    const eventTypeMap = {
      started: startEvent,
      finished: finishEvent,
    };
    
    // This will be called within scope
    await emit({
      type: eventTypeMap[eventType],
      payload: {
        command,
        ...payload,
      },
    });
  };

  return {
    emit: emitEvent,
    scope,
  };
}

/**
 * Simplified tracking helper that uses runScope directly
 * Use this if you want to use runScope from @kb-labs/analytics-sdk-node directly
 */
export async function withAnalyticsScope<T>(
  config: {
    actor?: string;
    context?: Record<string, unknown>;
  },
  fn: (emit: AnalyticsEmit) => Promise<T>
): Promise<T> {
  try {
    // Dynamic import to avoid hard dependency
    // eslint-disable-next-line import/no-extraneous-dependencies
    const analyticsSdk = await import('@kb-labs/analytics-sdk-node');
    const runScope = analyticsSdk.runScope as (config: unknown, fn: (emit: AnalyticsEmit) => Promise<T>) => Promise<T>;
    return await runScope(
      {
        actor: config.actor || 'cli',
        ctx: config.context || {},
      },
      fn
    );
  } catch {
    // Analytics SDK not available - run without analytics
    const noopEmit: AnalyticsEmit = async () => Promise.resolve();
    return await fn(noopEmit);
  }
}

