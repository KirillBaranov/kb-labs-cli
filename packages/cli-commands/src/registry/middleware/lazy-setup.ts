/**
 * Lazy Setup Middleware
 *
 * ADR-0009: Lazy Setup on First Command
 *
 * This middleware ensures plugin setup handlers run automatically on first command invocation.
 * State is tracked via State Broker with key pattern: `plugin:{id}:setup-done`
 *
 * Benefits:
 * - No discovery slowdown (setup not run during workspace scanning)
 * - Works for marketplace plugins (automatic on first use)
 * - Works for local development (automatic when plugin added)
 * - Graceful degradation (continues if State Broker unavailable)
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';

/**
 * Ensure plugin setup has been run before executing commands.
 *
 * @param manifestV2 - Plugin manifest declaring setup handler
 * @param ctx - CLI execution context with presenter
 * @param flags - Command flags (may contain debug flag)
 * @param findCommand - Function to find commands in registry
 * @returns Promise resolving to success/failure with optional error message
 */
export async function ensurePluginSetup(
  manifestV2: ManifestV2,
  ctx: any,
  flags: Record<string, unknown>,
  findCommand: (path: string[]) => any
): Promise<{ ok: boolean; error?: string }> {
  // Debug logging
  if (flags.debug || flags.verbose) {
    ctx.presenter.info(`[lazy-setup] Checking setup for ${manifestV2.id}`);
  }

  // No setup handler declared - nothing to do
  if (!manifestV2.setup) {
    if (flags.debug || flags.verbose) {
      ctx.presenter.info(`[lazy-setup] No setup handler declared for ${manifestV2.id}`);
    }
    return { ok: true };
  }

  if (flags.debug || flags.verbose) {
    ctx.presenter.info(`[lazy-setup] Setup handler found for ${manifestV2.id}`);
  }

  try {
    // Import State Broker dynamically (optional dependency)
    const { createStateBroker } = await import('@kb-labs/state-broker');
    const stateBroker = createStateBroker();

    // Check if setup already completed
    const setupKey = `plugin:${manifestV2.id}:setup-done`;
    const setupState = await stateBroker.get(setupKey);

    if (flags.debug || flags.verbose) {
      ctx.presenter.info(`[lazy-setup] Checked state broker key: ${setupKey}, value: ${JSON.stringify(setupState)}`);
    }

    if (setupState) {
      // Setup already done - continue normally
      if (flags.debug || flags.verbose) {
        ctx.presenter.info(`[lazy-setup] Setup already completed, skipping`);
      }
      return { ok: true };
    }

    // Setup not done yet - run it now
    ctx.presenter.info(`⚙️  First time using ${manifestV2.id}, running setup...`);

    // Extract namespace from manifest ID (same logic as discover.ts)
    // Example: "@kb-labs/playbooks" → "playbooks"
    const namespace = manifestV2.id?.split('/').pop()?.replace(/^@/, '') || manifestV2.id;

    // Find auto-generated setup command in registry using namespace
    // Registry stores commands as "playbooks:setup", not "@kb-labs/playbooks:setup"
    const setupCommandId = `${namespace}:setup`;

    if (flags.debug || flags.verbose) {
      ctx.presenter.info(`[lazy-setup] Looking for setup command: ${setupCommandId}`);
    }

    const setupCommand = findCommand([setupCommandId]);

    if (!setupCommand || typeof setupCommand.run !== 'function') {
      return {
        ok: false,
        error: `Plugin ${manifestV2.id} declares setup but setup command not found in registry`,
      };
    }

    // Execute setup command
    const setupResult = await setupCommand.run(ctx, [], flags);
    const setupExitCode = typeof setupResult === 'number' ? setupResult : 0;

    if (setupExitCode !== 0) {
      return {
        ok: false,
        error: `Setup failed with exit code ${setupExitCode}`,
      };
    }

    // Mark setup as complete (persist forever)
    await stateBroker.set(
      setupKey,
      {
        timestamp: Date.now(),
        version: manifestV2.version,
      },
      Infinity
    );

    ctx.presenter.info(`✅ Setup complete for ${manifestV2.id}`);
    return { ok: true };
  } catch (error: any) {
    // Graceful degradation - continue execution even if setup check fails
    // This allows plugins to work when State Broker is unavailable
    if (flags.debug) {
      ctx.presenter.warn(`[debug] Setup check failed: ${error.message}`);
    }
    return { ok: true }; // Continue execution despite setup check failure
  }
}
