/**
 * log-test command - Comprehensive logging system test
 * 
 * Tests:
 * - All log levels (debug, info, warn, error)
 * - Context tracking (traceId, spanId, executionId, parentSpanId)
 * - Redaction (sensitive data masking)
 * - Structured metadata
 * - Error handling
 * - Child loggers
 * - Helper functions
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import {
  getLogger,
  setLogContext,
  clearLogContext,
  withLogContext,
  logAction,
  logError,
  createPluginLogger,
} from '@kb-labs/core-sys/logging';
import { randomUUID } from 'node:crypto';

type LogTestResult = CommandResult & {
  tests?: Array<{ name: string; passed: boolean }>;
};

type LogTestFlags = {
  json: { type: 'boolean'; description?: string };
};

export const logTest = defineSystemCommand<LogTestFlags, LogTestResult>({
  name: 'log-test',
  description: 'Comprehensive test of logging system (levels, context, redaction, etc.)',
  category: 'logging',
  examples: generateExamples('log-test', 'kb', [
    { flags: {} },
    { flags: { json: true } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'log-test',
    startEvent: 'LOG_TEST_STARTED',
    finishEvent: 'LOG_TEST_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const logger = getLogger('log-test');
    const jsonMode = flags.json; // Type-safe: boolean
    
    ctx.platform?.logger?.info('Log test started', { jsonMode });
    
    if (!jsonMode) {
      ctx.ui.write("🧪 Comprehensive Logging System Test\n\n");
    }
    
    // ============================================
    // 1. Test all log levels
    // ============================================
    if (!jsonMode) ctx.ui.write("1️⃣  Testing log levels:\n");
    
    logger.debug("Debug message", { 
      test: "levels",
      level: "debug",
      details: "This should only appear with --debug flag"
    });
    
    logger.info("Info message", { 
      test: "levels",
      level: "info",
      message: "This is informational"
    });
    
    logger.warn("Warning message", { 
      test: "levels",
      level: "warn",
      warning: "This is a warning"
    });
    
    logger.error("Error message", { 
      test: "levels",
      level: "error",
      error: "This is an error"
    });
    
    // ============================================
    // 2. Test context tracking (traceId, spanId, executionId, parentSpanId)
    // ============================================
    if (!jsonMode) ctx.ui.write("\n2️⃣  Testing context tracking:\n");
    
    const traceId = randomUUID();
    const executionId = randomUUID();
    
    // Set global context
    setLogContext({
      traceId,
      executionId,
      spanId: "span-root",
    });
    
    logger.info("Log with global context", {
      test: "context",
      note: "Should include traceId, executionId, spanId"
    });
    
    // Nested span
    const childSpanId = randomUUID();
    setLogContext({
      traceId,
      executionId,
      spanId: childSpanId,
      parentSpanId: "span-root",
    });
    
    logger.info("Log with nested span", {
      test: "context",
      note: "Should include parentSpanId"
    });
    
    // Test withLogContext helper
    withLogContext({
      traceId: randomUUID(),
      spanId: "span-temp",
      executionId,
    }, () => {
      logger.info("Log with temporary context", {
        test: "context",
        note: "Context should be restored after this"
      });
    });
    
    // Restore original context
    setLogContext({
      traceId,
      executionId,
      spanId: "span-root",
    });
    
    logger.info("Log after context restore", {
      test: "context",
      note: "Should use original context"
    });
    
    // ============================================
    // 3. Test redaction (sensitive data masking)
    // ============================================
    if (!jsonMode) ctx.ui.write("\n3️⃣  Testing redaction (sensitive data):\n");
    
    logger.info("Log with API key", {
      test: "redaction",
      apiKey: "sk_live_1234567890abcdef",
      note: "API key should be masked in logs"
    });
    
    logger.info("Log with password", {
      test: "redaction",
      password: "super-secret-password",
      token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      secretKey: "secret_abc123",
      note: "All sensitive fields should be masked"
    });
    
    logger.info("Log with nested sensitive data", {
      test: "redaction",
      config: {
        apiKey: "sk_test_xyz",
        credentials: {
          accessToken: "token123",
          refreshToken: "refresh456",
        },
        env: {
          DATABASE_PASSWORD: "dbpass",
        }
      },
      note: "Nested sensitive data should be masked"
    });
    
    // ============================================
    // 4. Test structured metadata
    // ============================================
    if (!jsonMode) ctx.ui.write("\n4️⃣  Testing structured metadata:\n");
    
    logger.info("Log with complex metadata", {
      test: "metadata",
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
      },
      operation: {
        type: "create",
        resource: "project",
        resourceId: "proj-456",
      },
      timing: {
        startTime: new Date().toISOString(),
        duration: 123,
      },
      tags: ["important", "test"],
    });
    
    // ============================================
    // 5. Test error handling
    // ============================================
    if (!jsonMode) ctx.ui.write("\n5️⃣  Testing error handling:\n");
    
    // Error with Error object
    try {
      throw new Error("Test error for logging");
    } catch (err) {
      logger.error("Caught error", err instanceof Error ? err : new Error(String(err)));
    }
    
    // Error with context
    try {
      throw new TypeError("Type error example");
    } catch (err) {
      logger.error("Type error occurred", {
        error: err instanceof Error ? err : new Error(String(err)),
        context: {
          operation: "test",
          step: "error-handling",
        }
      });
    }
    
    // ============================================
    // 6. Test child loggers
    // ============================================
    if (!jsonMode) ctx.ui.write("\n6️⃣  Testing child loggers:\n");
    
    const childLogger = logger.child({ 
      category: "log-test:child",
      meta: { 
        parent: "log-test",
        childId: "child-1"
      } 
    });
    
    childLogger.info("Child logger info", { additional: "data" });
    childLogger.debug("Child logger debug", { additional: "data" });
    childLogger.warn("Child logger warn", { additional: "data" });
    childLogger.error("Child logger error", { additional: "data" });
    
    // ============================================
    // 7. Test helper functions
    // ============================================
    if (!jsonMode) ctx.ui.write("\n7️⃣  Testing helper functions:\n");
    
    // logAction
    logAction(logger, "User action completed", {
      userId: "user-123",
      action: "create-project",
      projectId: "proj-456",
      outcome: "success",
    });
    
    logAction(logger, "User action failed", {
      userId: "user-123",
      action: "delete-file",
      fileId: "file-789",
      outcome: "failure",
    });
    
    // logError
    try {
      throw new Error("Simulated error for logError helper");
    } catch (err) {
      logError(logger, err instanceof Error ? err : new Error(String(err)), {
        userId: "user-123",
        operation: "test-operation",
      });
    }
    
    // createPluginLogger
    const pluginLogger = createPluginLogger("test-plugin", "1.0.0");
    pluginLogger.info("Plugin log message", {
      taskId: "task-123",
      status: "completed",
    });
    
    pluginLogger.error("Plugin error", {
      taskId: "task-456",
      error: "Something went wrong",
    });
    
    // ============================================
    // 8. Test workflow simulation
    // ============================================
    if (!jsonMode) ctx.ui.write("\n8️⃣  Testing workflow simulation:\n");
    
    const workflowId = randomUUID();
    setLogContext({
      traceId: randomUUID(),
      executionId: workflowId,
      spanId: "workflow-start",
    });
    
    logger.info("Workflow started", {
      workflowId,
      step: "initialization",
    });
    
    // Simulate workflow steps
    for (let i = 1; i <= 3; i++) {
      const stepSpanId = randomUUID();
      setLogContext({
        traceId: traceId,
        executionId: workflowId,
        spanId: stepSpanId,
        parentSpanId: i === 1 ? "workflow-start" : undefined,
      });
      
      logger.info(`Workflow step ${i}`, {
        workflowId,
        step: `step-${i}`,
        stepNumber: i,
      });
      
      if (i === 2) {
        logger.warn("Warning in workflow step", {
          workflowId,
          step: `step-${i}`,
          warning: "This is a test warning",
        });
      }
    }
    
    logger.info("Workflow completed", {
      workflowId,
      step: "completion",
    });
    
    // ============================================
    // Cleanup
    // ============================================
    clearLogContext();

    ctx.platform?.logger?.info('Log test completed');

    return {
      ok: true,
      test: 'logging-system',
      completed: true,
      tests: [
        'log-levels',
        'context-tracking',
        'redaction',
        'structured-metadata',
        'error-handling',
        'child-loggers',
        'helper-functions',
        'workflow-simulation',
      ],
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.ui.json(result);
    } else {
      ctx.ui.write('\n✅ Logging test completed!\n\n');
      ctx.ui.write('📋 Summary:\n');
      ctx.ui.write('  • All log levels tested\n');
      ctx.ui.write('  • Context tracking (traceId, spanId, executionId, parentSpanId)\n');
      ctx.ui.write('  • Redaction (sensitive data masking)\n');
      ctx.ui.write('  • Structured metadata\n');
      ctx.ui.write('  • Error handling\n');
      ctx.ui.write('  • Child loggers\n');
      ctx.ui.write('  • Helper functions\n');
      ctx.ui.write('  • Workflow simulation\n\n');
      ctx.ui.write('💡 Tips:\n');
      ctx.ui.write('  • Use --debug to see all debug logs\n');
      ctx.ui.write('  • Use --json to see structured JSON output\n');
      ctx.ui.write('  • Check logs for traceId, spanId, executionId fields\n');
      ctx.ui.write('  • Verify sensitive data is masked (apiKey, password, token)\n');
    }
  },
});

