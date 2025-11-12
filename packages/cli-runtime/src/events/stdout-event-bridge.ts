/**
 * @module @kb-labs/cli-runtime/events/stdout-event-bridge
 * Simple event bridge that writes structured events to stdout (and optional file).
 */

import type { Writable } from 'node:stream'
import {
  createEventSchemaRegistry,
  type PluginEventBridge,
  type PluginEventDefinition,
  type PluginEventEnvelope,
  type PluginEventSchemaRegistry,
} from '@kb-labs/plugin-runtime'

export interface StdoutEventBridgeOptions {
  stdout?: Writable
  writer?: Writable
  formatter?: (event: PluginEventEnvelope) => string
}

function defaultFormatter(event: PluginEventEnvelope): string {
  return JSON.stringify(event)
}

export class StdoutEventBridge implements PluginEventBridge {
  private readonly stdout: Writable
  private readonly writer?: Writable
  private readonly formatter: (event: PluginEventEnvelope) => string
  private readonly registry: PluginEventSchemaRegistry

  constructor(options: StdoutEventBridgeOptions = {}) {
    this.stdout = options.stdout ?? process.stdout
    this.writer = options.writer
    this.formatter = options.formatter ?? defaultFormatter
    this.registry = createEventSchemaRegistry()
  }

  async emit(event: PluginEventEnvelope): Promise<void> {
    const payload = this.formatter(event)
    this.stdout.write(`${payload}\n`)
    if (this.writer) {
      this.writer.write(`${payload}\n`)
    }
  }

  register<TPayload>(definition: PluginEventDefinition<TPayload>): void {
    this.registry.register(definition)
  }

  schemas(): PluginEventSchemaRegistry {
    return this.registry
  }
}


