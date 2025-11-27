/**
 * logging:init command - Initialize logging configuration
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type LoggingInitResult = CommandResult & {
  configPath?: string;
  config?: any;
};

type LoggingInitFlags = {
  force: { type: 'boolean'; description?: string };
};

export const loggingInit = defineSystemCommand<LoggingInitFlags, LoggingInitResult>({
  name: 'init',
  description: 'Initialize logging configuration interactively',
  category: 'logging',
  examples: ['kb logging:init', 'kb logging:init --force'],
  flags: {
    force: { type: 'boolean', description: 'Overwrite existing configuration' },
  },
  analytics: {
    command: 'logging:init',
    startEvent: 'LOGGING_INIT_STARTED',
    finishEvent: 'LOGGING_INIT_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const force = flags.force; // Type-safe: boolean
    const cwd = process.cwd();
    const configPath = resolve(cwd, 'kb.config.json');

    ctx.logger?.info('Initializing logging configuration', { configPath, force });

    // Проверить существование конфига
    if (existsSync(configPath) && !force) {
      throw new Error(`Configuration file already exists: ${configPath}. Use --force to overwrite.`);
    }

    if (!ctx.output) {
      throw new Error('Output not available');
    }

    // Простая интерактивная инициализация
    // В реальной версии можно использовать prompts библиотеку
    ctx.output.write(`${ctx.output.ui.colors.bold('🎯 Initializing logging configuration...\n')}`);

    // Базовый конфиг
    const config: any = {
      logging: {
        level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
        mode: 'auto',
        quiet: false,
        format: 'human',
        adapters: [
          {
            type: 'console',
            enabled: true,
            config: {},
          },
        ],
      },
    };

    // Добавить файловый адаптер для development
    if (process.env.NODE_ENV === 'development') {
      config.logging.adapters.push({
        type: 'file',
        enabled: true,
        config: {
          path: '.kb/logs/app.jsonl',
          maxSize: '50MB',
          maxAge: '7d',
        },
      });
    }

    // Если есть существующий конфиг, попробовать сохранить другие секции
    if (existsSync(configPath)) {
      try {
        const existing = JSON.parse(readFileSync(configPath, 'utf-8'));
        // Сохранить другие секции
        Object.keys(existing).forEach((key) => {
          if (key !== 'logging') {
            config[key] = existing[key];
          }
        });
      } catch {
        // Ignore
      }
    }

    // Записать конфиг
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    ctx.logger?.info('Logging configuration created', { configPath });

    return {
      ok: true,
      configPath,
      config,
    };
  },
  formatter(result, ctx, flags) {
    if (!ctx.output) {
      throw new Error('Output not available');
    }

    const lines: string[] = [];
    lines.push(
      `${ctx.output.ui.symbols.success} ${ctx.output.ui.colors.success('Created')} ${result.configPath ?? 'unknown'}\n`,
    );
    if (result.config?.logging) {
      lines.push(`${ctx.output.ui.colors.bold('Configuration:')}`);
      lines.push(`  Level: ${ctx.output.ui.colors.info(result.config.logging.level ?? 'info')}`);
      lines.push(`  Mode: ${ctx.output.ui.colors.info(result.config.logging.mode ?? 'auto')}`);
      lines.push(`  Format: ${ctx.output.ui.colors.info(result.config.logging.format ?? 'human')}`);
      lines.push(`\n${ctx.output.ui.colors.bold('Adapters:')}`);
      if (Array.isArray(result.config.logging.adapters)) {
        result.config.logging.adapters.forEach((adapter: any) => {
          const status = adapter.enabled ? ctx.output.ui.symbols.success : ctx.output.ui.symbols.error;
          lines.push(`  ${status} ${adapter.type} (${adapter.enabled ? 'enabled' : 'disabled'})`);
        });
      }
    }

    lines.push(`\n${ctx.output.ui.colors.muted('💡 Tip: Edit kb.config.json to add more adapters (Sentry, Loki, etc.)')}`);
    lines.push(`${ctx.output.ui.colors.muted('💡 Run "kb logging:check" to validate your configuration')}`);

    ctx.output.write(lines.join('\n') + '\n');
  },
});

