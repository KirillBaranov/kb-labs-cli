/**
 * plugins:scaffold command - Generate plugin template
 */

import type { Command } from "../../types/types.js";
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { box, safeColors, safeSymbols } from "@kb-labs/shared-cli-ui";
import { getContextCwd } from "../../utils/context.js";

export const pluginsScaffold: Command = {
  name: "plugins:scaffold",
  category: "system",
  describe: "Generate a new KB CLI plugin template",
  flags: [
    {
      name: "format",
      type: "string",
      description: "Module format: esm or cjs",
      default: "esm",
      choices: ["esm", "cjs"],
    },
  ],
  examples: [
    "kb plugins scaffold my-plugin",
    "kb plugins scaffold my-plugin --format cjs",
  ],

  async run(ctx, argv, flags) {
    if (argv.length === 0) {
      ctx.presenter.error("Please specify a plugin name");
      ctx.presenter.info("Usage: kb plugins scaffold <name>");
      return 1;
    }

    const pluginName = argv[0];
    if (!pluginName) {
      ctx.presenter.error("Please specify a plugin name");
      return 1;
    }
    const format = (flags.format as string) || 'esm';
    const isESM = format === 'esm';
    const extension = isESM ? 'ts' : 'ts';
    const moduleType = isESM ? 'module' : 'commonjs';
    const tsupFormat = isESM ? 'esm' : 'cjs';
    
    const baseDir = getContextCwd(ctx as { cwd?: string });
    const dir = path.join(baseDir, pluginName);
    
    try {
      // Check if directory exists
      try {
        await fs.access(dir);
        ctx.presenter.error(`Directory ${pluginName} already exists`);
        return 1;
      } catch {
        // Good, doesn't exist
      }
      
      await fs.mkdir(dir, { recursive: true });
      await fs.mkdir(path.join(dir, 'src'), { recursive: true });
      await fs.mkdir(path.join(dir, 'src', 'kb'), { recursive: true });
      await fs.mkdir(path.join(dir, 'src', 'commands'), { recursive: true });
      
      // package.json
      const packageJson = {
        name: `@your-scope/${pluginName}-cli`,
        version: "1.0.0",
        type: moduleType,
        description: `KB Labs CLI plugin: ${pluginName}`,
        keywords: ["kb-cli-plugin"],
        main: `./dist/kb/manifest.js`,
        exports: {
          "./kb/manifest": "./dist/kb/manifest.js"
        },
        files: ["dist"],
        scripts: {
          build: `tsup src/kb/manifest.ts src/commands/hello.ts --format ${tsupFormat} --dts`,
          dev: `tsup src/kb/manifest.ts src/commands/hello.ts --format ${tsupFormat} --watch`,
        },
        kb: {
          plugin: true,
          manifest: "./dist/kb/manifest.js"
        },
        dependencies: {
          "@kb-labs/plugin-manifest": "workspace:*",
          "@kb-labs/shared-cli-ui": "workspace:*",
          "@kb-labs/core-types": "workspace:*"
        },
        devDependencies: {
          "tsup": "^8.5.0",
          "typescript": "^5.6.3"
        }
      };
      
      await fs.writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
        'utf8'
      );
      
      // tsconfig.json
      const tsconfig = {
        extends: "@kb-labs/devkit/tsconfig/lib.json",
        compilerOptions: {
          outDir: "dist",
          rootDir: "src"
        },
        include: ["src/**/*"]
      };
      
      await fs.writeFile(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2),
        'utf8'
      );
      
      // Manifest file
      const manifestContent = `import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@your-scope/${pluginName}',
  version: '0.1.0',
  display: {
    name: '${pluginName} Plugin',
    description: 'Example KB Labs CLI plugin using manifest v2'
  },
  permissions: {
    fs: {
      mode: 'read',
      allow: ['.']
    },
    env: {
      allow: ['NODE_ENV']
    }
  },
  cli: {
    commands: [
      {
        id: 'hello',
        group: '${pluginName}',
        describe: 'Hello command from ${pluginName}',
        flags: [],
        handler: './commands/hello#run'
      }
    ]
  }
};
`;
      
      await fs.writeFile(
        path.join(dir, 'src', 'kb', `manifest.${extension}`),
        manifestContent,
        'utf8'
      );
      
      // Command implementation
      const commandContent = `import type { CommandModule } from '@kb-labs/cli-commands';
import { box, keyValue, formatTiming, TimingTracker, safeColors } from '@kb-labs/shared-cli-ui';
import { getContextCwd } from "@kb-labs/shared-cli-ui";
import type { TelemetryEvent, TelemetryEmitResult } from '@kb-labs/core-types';

export const run: CommandModule['run'] = async (ctx, argv, flags) => {
  const tracker = new TimingTracker();
  const jsonMode = !!flags.json;
  const quiet = !!flags.quiet;
  
  // Optional analytics - use dynamic import
  let runScope: ((options: any, fn: (emit: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>) => Promise<any>) => Promise<any>) | null = null;
  try {
    const analytics = await import('@kb-labs/analytics-sdk-node');
    runScope = analytics.runScope as any;
  } catch {
    // analytics-sdk-node not available
  }
  
  const executeWithAnalytics = async (emit: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>) => {
    try {
      tracker.checkpoint('start');
      await emit({ type: 'COMMAND_STARTED', payload: {} });
      
      // Your command logic here
      // Example: const result = await doSomething();
      const result = { count: 1, message: 'Hello from ${pluginName} plugin!' };
      
      tracker.checkpoint('complete');
      const duration = tracker.total();
      
      if (jsonMode) {
        ctx.presenter.json({ ok: true, ...result, timing: duration });
      } else {
        if (!quiet) {
          const summary = keyValue({
            'Status': safeColors.success('✓ Success'),
            'Message': result.message,
          });
          summary.push('', \`Time: \${formatTiming(duration)}\`);
          ctx.presenter.write(box('${pluginName} Command', summary));
        }
      }
      
      await emit({ 
        type: 'COMMAND_FINISHED', 
        payload: { durationMs: duration, result: 'success' } 
      });
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage, timing: tracker.total() });
      } else {
        ctx.presenter.error(errorMessage);
      }
      await emit({ 
        type: 'COMMAND_FINISHED', 
        payload: { durationMs: tracker.total(), result: 'error', error: errorMessage } 
      });
      return 1;
    }
  };
  
  if (runScope) {
    return await runScope(
      {
        actor: { type: 'agent', id: '${pluginName}' },
        ctx: { workspace: getContextCwd(ctx) },
      },
      executeWithAnalytics
    ) as number;
  } else {
    // No analytics - create no-op emitter
    const noOpEmit = async (_event: Partial<TelemetryEvent>): Promise<TelemetryEmitResult> => {
      return { queued: false, reason: 'Analytics not available' };
    };
    return await executeWithAnalytics(noOpEmit);
  }
};
`;
      
      await fs.writeFile(
        path.join(dir, 'src', 'commands', `hello.${extension}`),
        commandContent,
        'utf8'
      );
      
      // tsup.config.ts
      const tsupConfig = `import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: ['src/kb/manifest.ts', 'src/commands/hello.ts'],
  format: ['${tsupFormat}'],
  dts: true,
};
`;
      
      await fs.writeFile(
        path.join(dir, 'tsup.config.ts'),
        tsupConfig,
        'utf8'
      );
      
      // README.md
      const readme = `# ${pluginName} CLI Plugin

KB Labs CLI plugin for ${pluginName}.

## Installation

\`\`\`bash
pnpm add @your-scope/${pluginName}-cli
\`\`\`

## Usage

\`\`\`bash
kb ${pluginName} hello
\`\`\`

## Development

\`\`\`bash
# Build
pnpm build

# Watch mode
pnpm dev

# Link for local development
kb plugins link ./${pluginName}
\`\`\`
`;
      
      await fs.writeFile(
        path.join(dir, 'README.md'),
        readme,
        'utf8'
      );
      
      // .gitignore
      const gitignore = `node_modules
dist
*.log
.DS_Store
`;
      
      await fs.writeFile(
        path.join(dir, '.gitignore'),
        gitignore,
        'utf8'
      );
      
      const sections = [
        safeColors.bold('Plugin Template Created:'),
        `${safeSymbols.success} ${safeColors.info(dir)}`,
        '',
        safeColors.bold('Next Steps:'),
        `  ${safeColors.info(`cd ${pluginName}`)}`,
        `  ${safeColors.info('pnpm install')}`,
        `  ${safeColors.info('pnpm build')}`,
        `  ${safeColors.info(`kb plugins link ./${pluginName}`)}`,
        `  ${safeColors.info(`kb ${pluginName} hello`)}`,
        '',
        safeColors.dim('See docs/plugin-development.md for more details'),
      ];
      
      const output = box('Plugin Scaffold', sections);
      ctx.presenter.write(output);
      
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      ctx.presenter.error(`Failed to create scaffold: ${errorMessage}`);
      return 1;
    }
  },
};

