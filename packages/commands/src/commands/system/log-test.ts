/**
 * log-test command - Test all log levels
 */

import type { Command } from "../../types/types";
import { getLogger } from "@kb-labs/core-sys/logging";

export const logTest: Command = {
  name: "log-test",
  category: "system",
  describe: "Test all log levels (trace, debug, info, warn, error)",
  flags: [],
  examples: [
    "kb log-test",
    "kb log-test --debug",
    "kb log-test --log-level info",
    "kb log-test --log-level warn",
    "kb log-test --log-level error",
  ],

  async run(ctx, argv, flags) {
    const logger = getLogger('log-test');
    
    ctx.presenter.write("Testing all log levels:\n\n");
    
    // Test error level
    ctx.presenter.write("1. ERROR level:\n");
    logger.error("This is an ERROR message", { 
      test: true, 
      level: "error",
      timestamp: new Date().toISOString()
    });
    
    // Test error with Error object
    try {
      throw new Error("Test error object");
    } catch (err) {
      logger.error("This is an ERROR with Error object", err instanceof Error ? err : new Error(String(err)));
    }
    
    ctx.presenter.write("\n2. WARN level:\n");
    logger.warn("This is a WARN message", { 
      test: true, 
      level: "warn",
      warning: "This is a test warning"
    });
    
    ctx.presenter.write("\n3. INFO level:\n");
    logger.info("This is an INFO message", { 
      test: true, 
      level: "info",
      info: "This is informational"
    });
    
    ctx.presenter.write("\n4. DEBUG level:\n");
    logger.debug("This is a DEBUG message", { 
      test: true, 
      level: "debug",
      debug: "This is debug information"
    });
    
    // Test child logger
    ctx.presenter.write("\n5. Child logger with category:\n");
    const childLogger = logger.child({ category: "log-test:child", meta: { parent: "log-test" } });
    childLogger.info("This is from child logger");
    childLogger.debug("This is debug from child logger");
    childLogger.warn("This is warn from child logger");
    childLogger.error("This is error from child logger");
    
    ctx.presenter.write("\n6. Multiple messages:\n");
    for (let i = 1; i <= 3; i++) {
      logger.info(`Info message ${i}`, { iteration: i });
      logger.debug(`Debug message ${i}`, { iteration: i });
    }
    
    ctx.presenter.write("\n✅ Log test completed! Check output above.\n");
    ctx.presenter.write("\nNote: Some logs may not appear depending on --log-level flag.\n");
    ctx.presenter.write("Use --debug to see all debug logs.\n");
    
    return 0;
  },
};

