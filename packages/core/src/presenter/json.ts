import type { Presenter } from "./types";
export function createJsonPresenter(): Presenter {
  return {
    isTTY: false,
    isQuiet: false,
    isJSON: true,                                    // NEW
    write: (_line) => { },                           // no-op в JSON режиме
    warn: (_line) => { },                            // no-op (копится в ctx.diagnostics)
    error: (line) =>
      console.log(JSON.stringify({ ok: false, error: { message: line } })),
    json: (payload) => {
      console.log(JSON.stringify(payload));
    },
  };
}
