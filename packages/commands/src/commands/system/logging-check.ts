/**
 * logging:check command - Check logging configuration
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLogger } from '@kb-labs/core-sys/logging';

type LoggingCheckResult = CommandResult & {
  configFile?: string;
  configExists?: boolean;
  configValid?: boolean;
  configErrors?: any[];
  adapters?: Array<{ type: string; enabled: boolean }>;
  testResults?: {
    debug: boolean;
    info: boolean;
    warn: boolean;
    error: boolean;
  };
};

type LoggingCheckFlags = {
  json: { type: 'boolean'; description?: string };
};

export const loggingCheck = defineSystemCommand<LoggingCheckFlags, LoggingCheckResult>({
  name: 'logging:check',
  description: 'Check logging configuration and test logging system',
  category: 'system',
  examples: ['kb logging:check', 'kb logging:check --json'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'logging:check',
    startEvent: 'LOGGING_CHECK_STARTED',
    finishEvent: 'LOGGING_CHECK_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const jsonMode = flags.json; // Type-safe: boolean
    const logger = getLogger('logging:check');
    const cwd = process.cwd();
    
    const results: {
      configFile: string;
      configExists: boolean;
      configValid?: boolean;
      configErrors?: any[];
      adapters?: Array<{ type: string; enabled: boolean }>;
      testResults?: {
        debug: boolean;
        info: boolean;
        warn: boolean;
        error: boolean;
      };
    } = {
      configFile: '',
      configExists: false,
    };
    
    // 1. Проверить наличие kb.config.json
    const configPaths = [
      resolve(cwd, 'kb.config.json'),
      resolve(cwd, `kb.config.${process.env.NODE_ENV || 'development'}.json`),
      resolve(cwd, 'kb.config.production.json'),
      resolve(cwd, 'kb.config.development.json'),
    ];
    
    let configFound = false;
    let configPath = '';
    let config: any = null;
    
    for (const path of configPaths) {
      if (existsSync(path)) {
        configPath = path;
        configFound = true;
        try {
          const content = readFileSync(path, 'utf-8');
          config = JSON.parse(content);
          break;
        } catch (error) {
          results.configValid = false;
          results.configErrors = [error instanceof Error ? error.message : String(error)];
        }
      }
    }
    
    results.configFile = configPath || 'not found';
    results.configExists = configFound;
    
    if (configFound && config) {
      results.configValid = true;
      
      // Проверить секцию logging
      if (config.logging) {
        const loggingConfig = config.logging;
        
        // Показать адаптеры
        if (loggingConfig.adapters && Array.isArray(loggingConfig.adapters)) {
          results.adapters = loggingConfig.adapters.map((adapter: any) => ({
            type: adapter.type,
            enabled: adapter.enabled || false,
          }));
        }
      }
    }
    
    // 2. Протестировать логирование
    const testResults = {
      debug: false,
      info: false,
      warn: false,
      error: false,
    };
    
    // Тест каждого уровня
    try {
      logger.debug('Test debug message', { test: true });
      testResults.debug = true;
    } catch (e) {
      // Ignore
    }
    
    try {
      logger.info('Test info message', { test: true });
      testResults.info = true;
    } catch (e) {
      // Ignore
    }
    
    try {
      logger.warn('Test warn message', { test: true });
      testResults.warn = true;
    } catch (e) {
      // Ignore
    }
    
    try {
      logger.error('Test error message', { test: true });
      testResults.error = true;
    } catch (e) {
      // Ignore
    }
    
    results.testResults = testResults;
    
    ctx.logger?.info('Logging check completed', {
      configFound,
      configValid: results.configValid,
      adaptersCount: results.adapters?.length || 0,
    });

    return {
      ok: true,
      ...results,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
      return;
    }

    if (!ctx.output) {
      throw new Error('Output not available');
    }

    const lines: string[] = [];

    lines.push(ctx.output.ui.colors.bold('🔍 Logging Configuration Check\n'));

    // Конфигурационный файл
    lines.push(ctx.output.ui.colors.bold('Configuration File:'));
    if (result.configExists) {
      lines.push(`  ${ctx.output.ui.symbols.success} Found: ${result.configFile ?? 'unknown'}`);
      if (result.configValid) {
        lines.push(`  ${ctx.output.ui.symbols.success} Valid JSON`);
      } else {
        lines.push(`  ${ctx.output.ui.symbols.error} Invalid JSON`);
        if (result.configErrors) {
          result.configErrors.forEach((err) => {
            lines.push(`    ${ctx.output.ui.colors.error(String(err))}`);
          });
        }
      }
    } else {
      lines.push(`  ${ctx.output.ui.symbols.warning} Not found (using defaults)`);
    }

    // Адаптеры
    if (result.adapters && result.adapters.length > 0) {
      lines.push(`\n${ctx.output.ui.colors.bold('Adapters:')}`);
      result.adapters.forEach((adapter) => {
        const status = adapter.enabled ? ctx.output.ui.symbols.success : ctx.output.ui.symbols.error;
        const statusText = adapter.enabled
          ? ctx.output.ui.colors.success('enabled')
          : ctx.output.ui.colors.error('disabled');
        lines.push(`  ${status} ${adapter.type}: ${statusText}`);
      });
    } else if (result.configExists) {
      lines.push(`\n${ctx.output.ui.colors.bold('Adapters:')}`);
      lines.push(`  ${ctx.output.ui.colors.muted('No adapters configured (using defaults)')}`);
    }

    // Тест логирования
    if (result.testResults) {
      lines.push(`\n${ctx.output.ui.colors.bold('Logging Test:')}`);
      const testStatus = (name: string, passed: boolean) => {
        const icon = passed ? ctx.output.ui.symbols.success : ctx.output.ui.symbols.error;
        const color = passed ? ctx.output.ui.colors.success : ctx.output.ui.colors.error;
        lines.push(`  ${icon} ${color(name)}: ${passed ? 'OK' : 'FAILED'}`);
      };

      testStatus('Debug', result.testResults.debug);
      testStatus('Info', result.testResults.info);
      testStatus('Warn', result.testResults.warn);
      testStatus('Error', result.testResults.error);
    }

    // Рекомендации
    lines.push(`\n${ctx.output.ui.colors.bold('Recommendations:')}`);
    if (!result.configExists) {
      lines.push(`  ${ctx.output.ui.colors.info('• Run "kb logging:init" to create a configuration file')}`);
    }
    if (!result.adapters || result.adapters.length === 0) {
      lines.push(`  ${ctx.output.ui.colors.info('• Consider adding adapters (Sentry, Loki, etc.) for production')}`);
    }

    ctx.output.write(lines.join('\n') + '\n');
  },
});

