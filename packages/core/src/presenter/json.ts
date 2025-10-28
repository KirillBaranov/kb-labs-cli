import type { Presenter } from "./types";
import type { CliContext } from "../context";

export function createJsonPresenter(): Presenter & { setContext(context: CliContext): void } {
  let context: CliContext | null = null;
  
  return {
    isTTY: false,
    isQuiet: false,
    isJSON: true,
    write: (_line) => { },
    info: (_line) => { },
    warn: (_line) => { },
    error: (line) =>
      console.log(JSON.stringify({ ok: false, error: { message: line } })),
    json: (payload) => {
      console.log(JSON.stringify(payload));
      if (context) {
        context.sentJSON = true;
      }
    },
    setContext(ctx: CliContext) {
      context = ctx;
    }
  };
}
