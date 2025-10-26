import type { Presenter } from "./types";

export function createTextPresenter(isQuiet: boolean = false): Presenter {
  const isTTY = process.stdout.isTTY === true;
  return {
    isTTY,
    isQuiet,
    isJSON: false,                                   // NEW
    write: (line) => {
      if (!isQuiet) {
        console.log(line);
      }
    },
    info: (line) => {                               // NEW
      if (!isQuiet) {
        console.log(line);
      }
    },
    warn: (line) => {                               // NEW
      if (!isQuiet) {
        console.warn(line);
      }
    },
    error: (line) => console.error(line),
    json: (_payload) => {
      throw new Error("json() called in text mode");
    },
  };
}
