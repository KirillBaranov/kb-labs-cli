/**
 * Output helpers for command context
 * Provides high-level utilities for formatting command output
 */

import type {
  CommandOutput,
  CommandResultParams,
} from '@kb-labs/shared-cli-ui';
import {
  formatCommandResult,
  successResult as createSuccessResult,
  errorResult as createErrorResult,
  warningResult as createWarningResult,
  infoResult as createInfoResult,
} from '@kb-labs/shared-cli-ui';

/**
 * Result builder for complex command results
 * Provides a fluent API for building command output
 *
 * @example
 * ```typescript
 * return ctx.result()
 *   .title('System Diagnostics')
 *   .summary({ 'Total': 4, 'OK': 3 })
 *   .section('Environment', ['Node 20.11.0'])
 *   .warnings(['Cache is old'])
 *   .timing(ctx.tracker.total())
 *   .build();
 * ```
 */
export class ResultBuilder {
  private params: Partial<CommandResultParams> = {
    status: 'success',
  };

  /**
   * Set the title
   */
  title(title: string): this {
    this.params.title = title;
    return this;
  }

  /**
   * Set summary metrics
   */
  summary(summary: Record<string, string | number>): this {
    this.params.summary = summary;
    return this;
  }

  /**
   * Add a detail section
   */
  section(sectionName: string, items: string[]): this {
    if (!this.params.details) {
      this.params.details = [];
    }
    this.params.details.push({ section: sectionName, items });
    return this;
  }

  /**
   * Add warnings
   */
  warnings(warnings: string[]): this {
    this.params.warnings = warnings;
    return this;
  }

  /**
   * Add errors
   */
  errors(errors: string[]): this {
    this.params.errors = errors;
    this.params.status = 'error';
    return this;
  }

  /**
   * Set timing
   */
  timing(ms: number): this {
    this.params.timing = ms;
    return this;
  }

  /**
   * Set status
   */
  status(status: 'success' | 'error' | 'warning' | 'info'): this {
    this.params.status = status;
    return this;
  }

  /**
   * Set custom JSON data
   */
  json(data: object): this {
    this.params.jsonData = data;
    return this;
  }

  /**
   * Build the command output
   */
  build(): CommandOutput {
    if (!this.params.title) {
      throw new Error('ResultBuilder: title is required');
    }
    if (!this.params.status) {
      throw new Error('ResultBuilder: status is required');
    }

    return formatCommandResult(this.params as CommandResultParams);
  }
}

/**
 * Output helper functions for command context
 */
export interface OutputHelpers {
  /**
   * Quick success result
   *
   * @example
   * ```typescript
   * return ctx.success('Version Info', {
   *   summary: { 'CLI Version': '0.1.0' },
   * });
   * ```
   */
  success(
    title: string,
    data?: {
      summary?: Record<string, string | number>;
      details?: Array<{ section: string; items: string[] }>;
      timing?: number;
      json?: object;
    }
  ): CommandOutput;

  /**
   * Quick error result
   *
   * @example
   * ```typescript
   * return ctx.error('Command Failed', new Error('Something went wrong'));
   * ```
   */
  error(
    title: string,
    error: Error | string,
    options?: {
      timing?: number;
      suggestions?: string[];
    }
  ): CommandOutput;

  /**
   * Quick warning result
   *
   * @example
   * ```typescript
   * return ctx.warning('Configuration Updated', ['Deprecated option used']);
   * ```
   */
  warning(
    title: string,
    warnings: string[],
    options?: {
      summary?: Record<string, string | number>;
      timing?: number;
    }
  ): CommandOutput;

  /**
   * Quick info result
   *
   * @example
   * ```typescript
   * return ctx.info('Help Information', {
   *   details: [{ section: 'Usage', items: ['kb command'] }]
   * });
   * ```
   */
  info(
    title: string,
    data?: {
      summary?: Record<string, string | number>;
      details?: Array<{ section: string; items: string[] }>;
      timing?: number;
    }
  ): CommandOutput;

  /**
   * Start building a complex result
   *
   * @example
   * ```typescript
   * return ctx.result()
   *   .title('System Diagnostics')
   *   .summary({ Total: 4 })
   *   .build();
   * ```
   */
  result(): ResultBuilder;
}

/**
 * Create output helpers for command context
 */
export function createOutputHelpers(): OutputHelpers {
  return {
    success: (title, data) => createSuccessResult(title, data),
    error: (title, error, options) => createErrorResult(title, error, options),
    warning: (title, warnings, options) => createWarningResult(title, warnings, options),
    info: (title, data) => createInfoResult(title, data),
    result: () => new ResultBuilder(),
  };
}
