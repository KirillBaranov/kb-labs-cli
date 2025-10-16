import type { Presenter } from "./types";

export function createTextPresenter(isQuiet: boolean = false): Presenter {
  const isTTY = process.stdout.isTTY === true;
  return {
    isTTY,
    isQuiet,
    write: (line) => {
      if (!isQuiet) {
        console.log(line);
      }
    },
    error: (line) => console.error(line),
    json: (payload) => console.log(JSON.stringify(payload)),
  };
}
