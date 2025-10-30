/**
 * @kb-labs/cli-commands/registry
 * Telemetry collection (opt-in) for plugin system metrics
 */

interface TelemetryEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

interface TelemetryMetrics {
  discovery: {
    duration: number;
    packagesFound: number;
    cacheHit: boolean;
    sources: Record<string, number>;
  };
  registration: {
    commandsRegistered: number;
    collisions: number;
    errors: number;
  };
  execution: {
    commandId: string;
    duration: number;
    success: boolean;
    errorCode?: string;
  };
  cache: {
    hitRate: number;
    invalidations: number;
  };
}

class TelemetryCollector {
  private events: TelemetryEvent[] = [];
  private enabled = false;
  private optInPlugins = new Set<string>(); // Plugins that opted in
  
  /**
   * Check if telemetry is enabled for a plugin
   */
  isEnabled(pluginTelemetry: 'opt-in' | 'off' | undefined, packageName: string): boolean {
    // Check environment variable
    if (process.env.KB_CLI_TELEMETRY_DISABLE === '1') {
      return false;
    }
    
    // Global opt-in flag
    if (process.env.KB_CLI_TELEMETRY_ENABLE === '1') {
      this.enabled = true;
      return true;
    }
    
    // Plugin-specific opt-in
    if (pluginTelemetry === 'opt-in') {
      this.optInPlugins.add(packageName);
      this.enabled = true;
      return true;
    }
    
    // Plugin explicitly disabled
    if (pluginTelemetry === 'off') {
      return false;
    }
    
    return false;
  }
  
  /**
   * Record discovery metrics
   */
  recordDiscovery(metrics: TelemetryMetrics['discovery']): void {
    if (!this.enabled) return;
    
    this.events.push({
      type: 'discovery',
      timestamp: Date.now(),
      data: metrics,
    });
  }
  
  /**
   * Record registration metrics
   */
  recordRegistration(metrics: TelemetryMetrics['registration']): void {
    if (!this.enabled) return;
    
    this.events.push({
      type: 'registration',
      timestamp: Date.now(),
      data: metrics,
    });
  }
  
  /**
   * Record execution metrics
   */
  recordExecution(metrics: TelemetryMetrics['execution']): void {
    if (!this.enabled) return;
    
    this.events.push({
      type: 'execution',
      timestamp: Date.now(),
      data: metrics,
    });
  }
  
  /**
   * Record cache metrics
   */
  recordCache(metrics: TelemetryMetrics['cache']): void {
    if (!this.enabled) return;
    
    this.events.push({
      type: 'cache',
      timestamp: Date.now(),
      data: metrics,
    });
  }
  
  /**
   * Record schema validation error
   */
  recordSchemaError(manifestId: string, error: string): void {
    if (!this.enabled) return;
    
    this.events.push({
      type: 'schema_error',
      timestamp: Date.now(),
      data: {
        manifestId,
        error,
      },
    });
  }
  
  /**
   * Get aggregated metrics
   */
  getMetrics(): {
    discovery: {
      total: number;
      avgDuration: number;
      cacheHitRate: number;
    };
    registration: {
      total: number;
      errors: number;
      collisions: number;
    };
    execution: {
      total: number;
      successRate: number;
      avgDuration: number;
    };
    topErrors: Array<{ error: string; count: number }>;
  } {
    const discovery = this.events.filter(e => e.type === 'discovery');
    const registration = this.events.filter(e => e.type === 'registration');
    const execution = this.events.filter(e => e.type === 'execution');
    const schemaErrors = this.events.filter(e => e.type === 'schema_error');
    
    const errorCounts = new Map<string, number>();
    for (const err of schemaErrors) {
      const error = err.data.error as string;
      errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
    }
    
    const topErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      discovery: {
        total: discovery.length,
        avgDuration: discovery.length > 0
          ? discovery.reduce((sum, e) => sum + (e.data.duration || 0), 0) / discovery.length
          : 0,
        cacheHitRate: discovery.length > 0
          ? discovery.filter(e => e.data.cacheHit).length / discovery.length
          : 0,
      },
      registration: {
        total: registration.length,
        errors: registration.reduce((sum, e) => sum + (e.data.errors || 0), 0),
        collisions: registration.reduce((sum, e) => sum + (e.data.collisions || 0), 0),
      },
      execution: {
        total: execution.length,
        successRate: execution.length > 0
          ? execution.filter(e => e.data.success).length / execution.length
          : 0,
        avgDuration: execution.length > 0
          ? execution.reduce((sum, e) => sum + (e.data.duration || 0), 0) / execution.length
          : 0,
      },
      topErrors,
    };
  }
  
  /**
   * Clear collected events
   */
  clear(): void {
    this.events = [];
  }
  
  /**
   * Get all events (for debugging/export)
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }
}

// Singleton instance
export const telemetry = new TelemetryCollector();

