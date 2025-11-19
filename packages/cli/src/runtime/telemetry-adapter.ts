/**
 * @module @kb-labs/cli-bin/runtime/telemetry-adapter
 * Telemetry adapter for CLI - connects analytics-sdk-node to plugin-runtime
 */

import type { TelemetryEmitter, TelemetryEvent, TelemetryEmitResult } from '@kb-labs/core-types';
import { setTelemetryEmitter } from '@kb-labs/plugin-runtime';

/**
 * Create a telemetry emitter adapter that uses analytics-sdk-node
 * 
 * This adapter bridges the gap between the TelemetryEmitter interface
 * and the analytics-sdk-node implementation.
 */
export async function createAnalyticsTelemetryEmitter(): Promise<TelemetryEmitter | null> {
  try {
    // Dynamic import to make analytics optional
    const analytics = await import('@kb-labs/analytics-sdk-node');
    
    const adapter: TelemetryEmitter = {
      async emit(event: Partial<TelemetryEvent>): Promise<TelemetryEmitResult> {
        try {
          // Map TelemetryEvent to AnalyticsEventV1 format
          const analyticsEvent: Partial<typeof analytics.AnalyticsEventV1> = {
            type: event.type,
            payload: event.payload as Record<string, unknown>,
            runId: event.runId,
            actor: event.actor as typeof analytics.AnalyticsEventV1.actor,
            ctx: event.ctx as typeof analytics.AnalyticsEventV1.ctx,
            timestamp: event.timestamp,
            ...event,
          };
          
          const result = await analytics.emit(analyticsEvent);
          return {
            queued: result.queued,
            reason: result.reason,
          };
        } catch (error) {
          return {
            queued: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      },
    };
    
    return adapter;
  } catch {
    // analytics-sdk-node not available
    return null;
  }
}

/**
 * Initialize telemetry for plugin-runtime
 * 
 * This should be called during CLI bootstrap to enable analytics
 * in plugin-runtime if analytics-sdk-node is available.
 */
export async function initializeTelemetry(): Promise<void> {
  const emitter = await createAnalyticsTelemetryEmitter();
  setTelemetryEmitter(emitter);
}

