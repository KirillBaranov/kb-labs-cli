import type { Command } from '../../types'
import { createCliEngineLogger } from './utils'
import {
  loadWorkflowConfig,
  saveWorkflowConfig,
  type RemoteMarketplaceSource,
} from '@kb-labs/workflow-runtime'

interface Flags {
  name?: string
  url?: string
  ref?: string
  path?: string
  json?: boolean
  verbose?: boolean
}

export const wfMarketplaceAdd: Command = {
  name: 'marketplace:add',
  describe: 'Add a remote marketplace source',
  category: 'workflows',
  aliases: ['wf:marketplace:add'],
  flags: [
    { name: 'name', type: 'string', description: 'Marketplace name' },
    { name: 'url', type: 'string', description: 'Git repository URL' },
    { name: 'ref', type: 'string', description: 'Branch or tag (default: main)' },
    { name: 'path', type: 'string', description: 'Subdirectory path in repo' },
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
    { name: 'verbose', type: 'boolean', description: 'Enable verbose logging' },
  ],
  examples: [
    'kb wf marketplace:add --name kb-labs-official --url https://github.com/kb-labs/workflows',
    'kb wf marketplace:add --name my-workflows --url https://github.com/user/repo --ref v1.0.0',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))

    if (!flags.name || !flags.url) {
      const message = 'Both --name and --url are required'
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(message)
      }
      return 1
    }

    try {
      const workspaceRoot = ctx.workspaceRoot ?? process.cwd()
      const config = await loadWorkflowConfig(workspaceRoot)

      const remotes = config.remotes ?? []

      // Check if name already exists
      const existing = remotes.find((r) => r.name === flags.name)
      if (existing) {
        const message = `Marketplace "${flags.name}" already exists`
        if (jsonMode) {
          ctx.presenter.json({ ok: false, error: message })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      // Add new remote
      const newRemote: RemoteMarketplaceSource = {
        name: flags.name!,
        url: flags.url!,
        ref: flags.ref,
        path: flags.path,
      }

      await saveWorkflowConfig(workspaceRoot, {
        remotes: [...remotes, newRemote],
      })

      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          marketplace: {
            name: flags.name,
            url: flags.url,
            ref: flags.ref,
            path: flags.path,
          },
        })
      } else {
        ctx.presenter.success(`✓ Added marketplace: ${flags.name}`)
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to add marketplace: ${message}`)
      }
      return 1
    }
  },
}

export const wfMarketplaceList: Command = {
  name: 'marketplace:list',
  describe: 'List configured remote marketplace sources',
  category: 'workflows',
  aliases: ['wf:marketplace:list'],
  flags: [
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
    { name: 'verbose', type: 'boolean', description: 'Enable verbose logging' },
  ],
  examples: ['kb wf marketplace:list', 'kb wf marketplace:list --json'],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)

    try {
      const workspaceRoot = ctx.workspaceRoot ?? process.cwd()
      const config = await loadWorkflowConfig(workspaceRoot)

      const remotes = config.remotes ?? []

      if (jsonMode) {
        ctx.presenter.json({ ok: true, remotes })
      } else {
        if (remotes.length === 0) {
          ctx.presenter.info('No remote marketplaces configured')
          return 0
        }

        ctx.presenter.write('\n📦 Remote Marketplaces\n')
        for (const remote of remotes) {
          ctx.presenter.write(`  • ${remote.name}`)
          ctx.presenter.write(`    URL: ${remote.url}`)
          if (remote.ref) {
            ctx.presenter.write(`    Ref: ${remote.ref}`)
          }
          if (remote.path) {
            ctx.presenter.write(`    Path: ${remote.path}`)
          }
          ctx.presenter.write('')
        }
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to list marketplaces: ${message}`)
      }
      return 1
    }
  },
}

export const wfMarketplaceRemove: Command = {
  name: 'marketplace:remove',
  describe: 'Remove a remote marketplace source',
  category: 'workflows',
  aliases: ['wf:marketplace:remove'],
  flags: [
    { name: 'name', type: 'string', description: 'Marketplace name to remove' },
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
    { name: 'verbose', type: 'boolean', description: 'Enable verbose logging' },
  ],
  examples: ['kb wf marketplace:remove --name kb-labs-official'],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)

    if (!flags.name) {
      const message = '--name is required'
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(message)
      }
      return 1
    }

    try {
      const workspaceRoot = ctx.workspaceRoot ?? process.cwd()
      const config = await loadWorkflowConfig(workspaceRoot)

      const remotes = config.remotes ?? []
      const index = remotes.findIndex((r) => r.name === flags.name)

      if (index === -1) {
        const message = `Marketplace "${flags.name}" not found`
        if (jsonMode) {
          ctx.presenter.json({ ok: false, error: message })
        } else {
          ctx.presenter.error(message)
        }
        return 1
      }

      const updatedRemotes = remotes.filter((r) => r.name !== flags.name)
      await saveWorkflowConfig(workspaceRoot, {
        remotes: updatedRemotes,
      })

      if (jsonMode) {
        ctx.presenter.json({ ok: true, removed: flags.name })
      } else {
        ctx.presenter.success(`✓ Removed marketplace: ${flags.name}`)
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to remove marketplace: ${message}`)
      }
      return 1
    }
  },
}

export const wfMarketplaceUpdate: Command = {
  name: 'marketplace:update',
  describe: 'Update a remote marketplace source (refetch from git)',
  category: 'workflows',
  aliases: ['wf:marketplace:update'],
  flags: [
    { name: 'name', type: 'string', description: 'Marketplace name to update (all if not specified)' },
    { name: 'json', type: 'boolean', description: 'Output as JSON' },
    { name: 'verbose', type: 'boolean', description: 'Enable verbose logging' },
  ],
  examples: [
    'kb wf marketplace:update',
    'kb wf marketplace:update --name kb-labs-official',
  ],
  async run(ctx, argv, rawFlags) {
    const flags = rawFlags as Flags
    const jsonMode = Boolean(flags.json)
    const logger = createCliEngineLogger(ctx, Boolean(flags.verbose))

    try {
      const workspaceRoot = ctx.workspaceRoot ?? process.cwd()
      const { createWorkflowRegistry } = await import('@kb-labs/workflow-runtime')

      // Create registry to trigger refresh
      const registry = await createWorkflowRegistry({
        workspaceRoot,
      })

      if (flags.name) {
        // Refresh specific remote
        await registry.refresh()
        if (jsonMode) {
          ctx.presenter.json({ ok: true, updated: flags.name })
        } else {
          ctx.presenter.success(`✓ Updated marketplace: ${flags.name}`)
        }
      } else {
        // Refresh all remotes
        await registry.refresh()
        if (jsonMode) {
          ctx.presenter.json({ ok: true, message: 'All marketplaces updated' })
        } else {
          ctx.presenter.success('✓ Updated all marketplaces')
        }
      }

      return 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: message })
      } else {
        ctx.presenter.error(`Failed to update marketplace: ${message}`)
      }
      return 1
    }
  },
}

