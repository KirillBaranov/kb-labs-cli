
// CRITICAL: Set default log level BEFORE any imports to prevent log spam
// This must happen before auto-init in lazy-loaded loggers
if (!process.env.LOG_LEVEL && !process.env.KB_LOG_LEVEL) {
  // Default to 'silent' to show NO logs without --debug flag
  // User can override with --debug flag or LOG_LEVEL/KB_LOG_LEVEL env var
  process.env.KB_LOG_LEVEL = 'silent';
}

// Check for --json flag BEFORE imports to ensure auto-init uses correct mode
// This prevents ConsoleSink from being created when user wants JSON output
if (process.argv.includes('--json')) {
  process.env.KB_OUTPUT_MODE = 'json';
}

import { run } from "./index";
import { platform } from "@kb-labs/core-runtime";

(async () => {
  let code: number | void;
  try {
    code = await run(process.argv.slice(2));
  } finally {
    try {
      await platform.shutdown();
    } catch (error) {
      process.stderr.write(
        `[kb] platform shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }

  if (typeof code === "number") {
    process.exit(code);
  }
})();
