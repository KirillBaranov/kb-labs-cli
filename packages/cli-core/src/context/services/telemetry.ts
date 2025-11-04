/**
 * @module @kb-labs/cli-core/context/services/telemetry
 * Telemetry service implementation
 */

import type { TelemetryService } from '../../types/index.js';

/**
 * No-op telemetry service (default)
 */
export class NoOpTelemetry implements TelemetryService {
  track(_event: string, _props?: object): void {
    // No-op
  }

  async flush(): Promise<void> {
    // No-op
  }
}

/**
 * Console telemetry service (for development)
 */
export class ConsoleTelemetry implements TelemetryService {
  track(event: string, props?: object): void {
    console.log(`[TELEMETRY] ${event}`, props || '');
  }

  async flush(): Promise<void> {
    // No-op for console
  }
}

