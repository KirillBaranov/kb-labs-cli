import type { Presenter } from "./types";
import type { SystemContext } from "../context";

export function createJsonPresenter(): Presenter & { setContext(context: SystemContext): void } {
  let context: SystemContext | null = null;

  return {
    isTTY: false,
    isQuiet: false,
    isJSON: true,
    write: (_line) => {},
    info: (_line) => {},
    warn: (_line) => {},
    error: (line) =>
      console.log(JSON.stringify({ ok: false, error: { message: line } })),
    json: (payload) => {
      console.log(JSON.stringify(payload));
      // System commands use simple JSON output
    },
    setContext(ctx: SystemContext) {
      context = ctx;
    },
  };
}

export type JsonPresenter = ReturnType<typeof createJsonPresenter>;
