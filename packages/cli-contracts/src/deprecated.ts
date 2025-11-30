/**
 * @module @kb-labs/cli-contracts/deprecated
 * Deprecated type aliases for backward compatibility
 *
 * These types will be removed in v2.5
 * Please migrate to the new types as soon as possible
 */

import type { SystemContext } from './system-context.js';

/**
 * @deprecated Use SystemContext instead
 * Will be removed in v2.5
 *
 * @example Migration
 * ```typescript
 * // Before
 * import type { CliContextV1 } from '@kb-labs/cli-contracts';
 * function handler(ctx: CliContextV1) { }
 *
 * // After
 * import type { SystemContext } from '@kb-labs/cli-contracts';
 * function handler(ctx: SystemContext) { }
 * ```
 */
export type CliContextV1 = SystemContext;

/**
 * @deprecated Use SystemContext instead
 * Will be removed in v2.5
 */
export type CliContext = SystemContext;

/**
 * @deprecated Use SystemContext instead
 * Will be removed in v2.5
 */
export type EnhancedCliContext = SystemContext;
