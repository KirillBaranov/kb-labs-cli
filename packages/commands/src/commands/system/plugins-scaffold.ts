/**
 * plugins:scaffold command - Generate plugin template
 */

import type { Command } from "../../types/types.js";
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { box, safeColors, safeSymbols } from "@kb-labs/shared-cli-ui";

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
    
    const dir = path.join(process.cwd(), pluginName);
    
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
        main: `./dist/index.js`,
        exports: {
          "./kb/commands": "./dist/kb/commands.js"
        },
        files: ["dist"],
        scripts: {
          build: "tsup src/kb/commands.ts --format esm --dts",
          dev: "tsup src/kb/commands.ts --format esm --watch",
        },
        kb: {
          plugin: true
        },
        dependencies: {
          "@kb-labs/cli-commands": "workspace:*"
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
      const manifestContent = `import type { CommandManifest } from '@kb-labs/cli-commands';

export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: '${pluginName}:hello',
    group: '${pluginName}',
    namespace: '${pluginName}',
    package: '@your-scope/${pluginName}-cli',
    describe: 'Hello command from ${pluginName} plugin',
    examples: [
      'kb ${pluginName} hello',
    ],
    loader: async () => import('../commands/hello.js'),
  },
];
`;
      
      await fs.writeFile(
        path.join(dir, 'src', 'kb', `commands.${extension}`),
        manifestContent,
        'utf8'
      );
      
      // Command implementation
      const commandContent = `import type { CommandModule } from '@kb-labs/cli-commands';

export const run: CommandModule['run'] = async (ctx, argv, flags) => {
  ctx.presenter.info('Hello from ${pluginName} plugin!');
  return 0;
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
  entry: ['src/kb/commands.ts'],
  format: ['esm'],
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

