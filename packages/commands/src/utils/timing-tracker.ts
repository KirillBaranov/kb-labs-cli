/**
 * TimingTracker - Utility for tracking execution time with checkpoints
 */
export class TimingTracker {
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();
  private lastCheckpoint: number;

  constructor() {
    this.startTime = Date.now();
    this.lastCheckpoint = this.startTime;
  }

  /**
   * Mark a checkpoint with a name
   * Measures time since last checkpoint (or start)
   */
  mark(name: string): void {
    const now = Date.now();
    const elapsed = now - this.lastCheckpoint;
    this.checkpoints.set(name, elapsed);
    this.lastCheckpoint = now;
  }

  /**
   * Alias for mark() - for backward compatibility
   */
  checkpoint(name: string): void {
    this.mark(name);
  }

  /**
   * Get total elapsed time since tracker creation
   */
  total(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get breakdown of all checkpoints
   */
  getBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const [name, elapsed] of this.checkpoints.entries()) {
      breakdown[name] = elapsed;
    }
    return breakdown;
  }

  /**
   * Reset tracker (start new timing session)
   */
  reset(): void {
    this.startTime = Date.now();
    this.lastCheckpoint = this.startTime;
    this.checkpoints.clear();
  }
}

