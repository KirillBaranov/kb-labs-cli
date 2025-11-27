/**
 * @module @kb-labs/cli-command-kit/helpers/context
 * Context helpers and re-exports
 */

// Re-export TimingTracker from shared-cli-ui
export { TimingTracker } from '@kb-labs/shared-cli-ui';

// Re-export CliContext type
export type { CliContext } from '@kb-labs/cli-contracts';

import type { CliContext as BaseCliContext } from '@kb-labs/cli-contracts';

/**
 * Enhanced context with tracker and output helpers
 */
import type { TimingTracker } from '@kb-labs/shared-cli-ui';
import type { OutputHelpers } from '../output-helpers.js';

export interface EnhancedCliContext extends BaseCliContext {
  /** Timing tracker instance */
  tracker: TimingTracker;

  /** Output formatting helpers */
  success: OutputHelpers['success'];
  error: OutputHelpers['error'];
  warning: OutputHelpers['warning'];
  info: OutputHelpers['info'];
  result: OutputHelpers['result'];
}

