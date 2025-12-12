import type { Presenter } from "./types";
import type { PluginContextV2 } from "../context";

export function createJsonPresenter(): Presenter & { setContext(context: PluginContextV2): void } {
  let context: PluginContextV2 | null = null;

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
      // V2: sentJSON tracking removed (not needed in PluginContextV2)
    },
    setContext(ctx: PluginContextV2) {
      context = ctx;
    },
  };
}

export type JsonPresenter = ReturnType<typeof createJsonPresenter>;
