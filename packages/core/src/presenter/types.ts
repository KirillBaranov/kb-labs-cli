export interface Presenter {
  isTTY: boolean;
  isQuiet: boolean;
  write(line: string): void;
  error(line: string): void;
  json(payload: unknown): void;
}
