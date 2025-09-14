import type { Presenter } from "./types";
export function createJsonPresenter(): Presenter {
    return {
        isTTY: false,
        section: () => {},
        line: () => {},
        table: () => {},
        json: (p) => console.log(JSON.stringify(p)),
        success: (m) => console.log(JSON.stringify({ ok: true, message: m })),
        warn: (m) => console.log(JSON.stringify({ ok: true, warning: m })),
        error: (m) => console.log(JSON.stringify({ ok: false, error: { message: m } })),
    };
}