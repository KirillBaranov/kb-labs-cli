import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit'
import { createCliEngineLogger } from './utils'
import {
  loadWorkflowConfig,
  saveWorkflowConfig,
  type RemoteMarketplaceSource,
} from '@kb-labs/workflow-runtime'
import type { EnhancedCliContext } from '@kb-labs/shared-command-kit'

type MarketplaceAddResult = CommandResult & {
  marketplace?: {
    name: string;
    url: string;
    ref?: string;
    path?: string;
  };
};

type WfMarketplaceAddFlags = {
  name: { type: 'string'; description?: string; required: true };
  url: { type: 'string'; description?: string; required: true };
  ref: { type: 'string'; description?: string };
  path: { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfMarketplaceAdd = defineSystemCommand<WfMarketplaceAddFlags, MarketplaceAddResult>({
  name: 'marketplace:add',
  description: 'Add a remote marketplace source',
  category: 'workflows',
  aliases: ['wf:marketplace:add'],
  flags: {
    name: { type: 'string', description: 'Marketplace name', required: true },
    url: { type: 'string', description: 'Git repository URL', required: true },
    ref: { type: 'string', description: 'Branch or tag (default: main)' },
    path: { type: 'string', description: 'Subdirectory path in repo' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf marketplace:add --name kb-labs-official --url https://github.com/kb-labs/workflows',
    'kb wf marketplace:add --name my-workflows --url https://github.com/user/repo --ref v1.0.0',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const jsonMode = flags.json // Type-safe: boolean
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean
    const name = flags.name // Type-safe: string (required)
    const url = flags.url // Type-safe: string (required)

    try {
      const workspaceRoot = process.cwd()
      const config = await loadWorkflowConfig(workspaceRoot)

      const remotes = config.remotes ?? []

      // Check if name already exists
      const existing = remotes.find((r) => r.name === name)
      if (existing) {
        const message = `Marketplace "${name}" already exists`
        if (jsonMode) {
          ctx.output?.json({ ok: false, error: message })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message }
      }

      // Add new remote
      const newRemote: RemoteMarketplaceSource = {
        name,
        url,
        ref: flags.ref, // Type-safe: string | undefined
        path: flags.path, // Type-safe: string | undefined
      }

      await saveWorkflowConfig(workspaceRoot, {
        remotes: [...remotes, newRemote],
      })

      if (jsonMode) {
        ctx.output?.json({
          ok: true,
          marketplace: {
            name,
            url,
            ref: flags.ref,
            path: flags.path,
          },
        })
      } else {
        ctx.output?.write(`✓ Added marketplace: ${name}\n`)
      }

      return { ok: true, marketplace: { name, url, ref: flags.ref, path: flags.path } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to add marketplace: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})

type MarketplaceListResult = CommandResult & {
  remotes?: RemoteMarketplaceSource[];
};

type WfMarketplaceListFlags = {
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfMarketplaceList = defineSystemCommand<WfMarketplaceListFlags, MarketplaceListResult>({
  name: 'marketplace:list',
  description: 'List configured remote marketplace sources',
  category: 'workflows',
  aliases: ['wf:marketplace:list'],
  flags: {
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: ['kb wf marketplace:list', 'kb wf marketplace:list --json'],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const jsonMode = Boolean(flags.json)

    try {
      const workspaceRoot = process.cwd()
      const config = await loadWorkflowConfig(workspaceRoot)

      const remotes = config.remotes ?? []

      if (jsonMode) {
        ctx.output?.json({ ok: true, remotes })
      } else {
        if (remotes.length === 0) {
          ctx.output?.info('No remote marketplaces configured')
          return { ok: true, remotes: [] }
        }

        ctx.output?.write('\n📦 Remote Marketplaces\n')
        for (const remote of remotes) {
          ctx.output?.write(`  • ${remote.name}`)
          ctx.output?.write(`    URL: ${remote.url}`)
          if (remote.ref) {
            ctx.output?.write(`    Ref: ${remote.ref}`)
          }
          if (remote.path) {
            ctx.output?.write(`    Path: ${remote.path}`)
          }
          ctx.output?.write('')
        }
      }

      return { ok: true, remotes }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to list marketplaces: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})

type MarketplaceRemoveResult = CommandResult & {
  removed?: string;
};

type WfMarketplaceRemoveFlags = {
  name: { type: 'string'; description?: string; required: true };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfMarketplaceRemove = defineSystemCommand<WfMarketplaceRemoveFlags, MarketplaceRemoveResult>({
  name: 'marketplace:remove',
  description: 'Remove a remote marketplace source',
  category: 'workflows',
  aliases: ['wf:marketplace:remove'],
  flags: {
    name: { type: 'string', description: 'Marketplace name to remove', required: true },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: ['kb wf marketplace:remove --name kb-labs-official'],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const jsonMode = flags.json // Type-safe: boolean
    const name = flags.name // Type-safe: string (required)

    try {
      const workspaceRoot = process.cwd()
      const config = await loadWorkflowConfig(workspaceRoot)

      const remotes = config.remotes ?? []
      const index = remotes.findIndex((r) => r.name === name)

      if (index === -1) {
        const message = `Marketplace "${name}" not found`
        if (jsonMode) {
          ctx.output?.json({ ok: false, error: message })
        } else {
          ctx.output?.error(message)
        }
        return { ok: false, error: message }
      }

      const updatedRemotes = remotes.filter((r) => r.name !== name)
      await saveWorkflowConfig(workspaceRoot, {
        remotes: updatedRemotes,
      })

      if (jsonMode) {
        ctx.output?.json({ ok: true, removed: name })
      } else {
        ctx.output?.write(`✓ Removed marketplace: ${name}\n`)
      }

      return { ok: true, removed: name }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to remove marketplace: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})

type MarketplaceUpdateResult = CommandResult & {
  updated?: string;
};

type WfMarketplaceUpdateFlags = {
  name: { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
  verbose: { type: 'boolean'; description?: string };
};

export const wfMarketplaceUpdate = defineSystemCommand<WfMarketplaceUpdateFlags, MarketplaceUpdateResult>({
  name: 'marketplace:update',
  description: 'Update a remote marketplace source (refetch from git)',
  category: 'workflows',
  aliases: ['wf:marketplace:update'],
  flags: {
    name: { type: 'string', description: 'Marketplace name to update (all if not specified)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Enable verbose logging' },
  },
  examples: [
    'kb wf marketplace:update',
    'kb wf marketplace:update --name kb-labs-official',
  ],
  async handler(ctx: EnhancedCliContext, argv: string[], flags) {
    const jsonMode = flags.json // Type-safe: boolean
    const logger = createCliEngineLogger(ctx, flags.verbose) // Type-safe: boolean

    try {
      const workspaceRoot = process.cwd()
      const { createWorkflowRegistry } = await import('@kb-labs/workflow-runtime')

      // Create registry to trigger refresh
      const registry = await createWorkflowRegistry({
        workspaceRoot,
      })

      const name = flags.name // Type-safe: string | undefined
      if (name) {
        // Refresh specific remote
        await registry.refresh()
        if (jsonMode) {
          ctx.output?.json({ ok: true, updated: name })
        } else {
          ctx.output?.write(`✓ Updated marketplace: ${name}\n`)
        }
      } else {
        // Refresh all remotes
        await registry.refresh()
        if (jsonMode) {
          ctx.output?.json({ ok: true, message: 'All marketplaces updated' })
        } else {
          ctx.output?.write('✓ Updated all marketplaces\n')
        }
      }

      return { ok: true, updated: name || 'all' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.output?.json({ ok: false, error: message })
      } else {
        ctx.output?.error(`Failed to update marketplace: ${message}`)
      }
      return { ok: false, error: message }
    }
  },
})
