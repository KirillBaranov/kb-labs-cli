import type { Presenter } from "./types";
export function createJsonPresenter(): Presenter {
  return {
    isTTY: false,
    write: (line) => console.log(JSON.stringify({ ok: true, message: line })),
    error: (line) =>
      console.log(JSON.stringify({ ok: false, error: { message: line } })),
    json: (payload) => console.log(JSON.stringify(payload)),
  };
}
