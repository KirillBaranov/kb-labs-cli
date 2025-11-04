/**
 * @module @kb-labs/cli-core/lifecycle/resource-tracker
 * Resource tracking for plugin cleanup
 */

import type { ResourceTracker, Disposable } from '../types/index.js';

/**
 * Resource tracker implementation
 */
export class ResourceTrackerImpl implements ResourceTracker {
  private resources: Map<string, Array<() => Promise<void>>> = new Map();

  register(pluginId: string, cleanup: () => Promise<void>): void {
    if (!this.resources.has(pluginId)) {
      this.resources.set(pluginId, []);
    }
    this.resources.get(pluginId)!.push(cleanup);
  }

  registerDisposable(pluginId: string, resource: Disposable): void {
    this.register(pluginId, async () => {
      await resource.dispose();
    });
  }

  async cleanupPlugin(pluginId: string): Promise<void> {
    const cleanups = this.resources.get(pluginId);
    if (!cleanups || cleanups.length === 0) {
      return;
    }

    // Run cleanups in parallel
    await Promise.allSettled(cleanups.map(fn => fn()));
    
    // Clear resources for this plugin
    this.resources.delete(pluginId);
  }

  async cleanupAll(): Promise<void> {
    const allCleanups: Array<() => Promise<void>> = [];
    
    for (const cleanups of this.resources.values()) {
      allCleanups.push(...cleanups);
    }

    // Run all cleanups in parallel
    await Promise.allSettled(allCleanups.map(fn => fn()));
    
    // Clear all resources
    this.resources.clear();
  }

  getResourceCount(pluginId: string): number {
    const cleanups = this.resources.get(pluginId);
    return cleanups ? cleanups.length : 0;
  }
}

