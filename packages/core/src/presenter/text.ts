import type { Presenter } from "./types";

export function createTextPresenter(): Presenter {
    const isTTY = process.stdout.isTTY === true;
    return {
        isTTY,
        write: (line) => console.log(line),
        error: (line) => console.error(line),
        json: (payload) => console.log(JSON.stringify(payload)),
    };
}