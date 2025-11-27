/**
 * @module @kb-labs/cli-command-kit/analytics/types
 * Types for analytics tracking
 */

/**
 * Analytics event payload
 */
export type AnalyticsEventPayload = Record<string, unknown>;

/**
 * Analytics event
 */
export interface AnalyticsEvent {
  type: string;
  payload?: AnalyticsEventPayload;
}

/**
 * Analytics emit function
 */
export type AnalyticsEmit = (event: Partial<AnalyticsEvent>) => Promise<unknown>;

/**
 * Analytics scope function
 */
export type AnalyticsScope = <T>(
  fn: (emit: AnalyticsEmit) => Promise<T>
) => Promise<T>;

/**
 * Tracking configuration
 */
export interface TrackingConfig {
  /** Command name for context */
  command: string;
  /** Event type for start */
  startEvent: string;
  /** Event type for finish */
  finishEvent: string;
  /** Actor identifier */
  actor?: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Include flags in payload */
  includeFlags?: boolean;
}

/**
 * Tracking result with emit and scope functions
 */
export interface TrackingResult {
  /** Emit analytics event */
  emit: (eventType: 'started' | 'finished', payload?: AnalyticsEventPayload) => Promise<void>;
  /** Run function within analytics scope */
  scope: AnalyticsScope;
}

