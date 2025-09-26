import path from "node:path";
import { existsSync } from "node:fs";

/** Very small repo root detector: looks for .git upwards. */
export function detectRepoRoot(start = process.cwd()): string {
  let cur = path.resolve(start);
  while (true) {
    if (existsSync(path.join(cur, ".git"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      return start;
    } // fallback
    cur = parent;
  }
}
