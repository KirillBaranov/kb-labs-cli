#!/usr/bin/env node
import { run } from "./index";

(async () => {
  const code = await run(process.argv.slice(2));
  if (typeof code === "number") {
    process.exit(code);
  }
})();
