export interface Presenter {
  isTTY: boolean;
  isQuiet: boolean;
  isJSON: boolean;
  write(line: string): void;
  warn(line: string): void;
  error(line: string): void;
  json(payload: unknown): void;
}
