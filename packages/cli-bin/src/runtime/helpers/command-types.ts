/**
 * Command type guards and helpers
 */

import type { CommandGroup } from '@kb-labs/cli-commands';

/**
 * Type guard to check if input is a CommandGroup
 */
export function isCommandGroup(input: unknown): input is CommandGroup {
  return (
    typeof input === 'object' &&
    input !== null &&
    'commands' in input
  );
}

/**
 * Type guard to check if presenter has setContext method
 */
export function hasSetContext(
  presenter: unknown,
): presenter is { setContext(ctx: any): void } {
  return (
    typeof presenter === 'object' &&
    presenter !== null &&
    'setContext' in presenter &&
    typeof (presenter as any).setContext === 'function'
  );
}
