export interface Presenter {
    isTTY: boolean;
    section(title: string): void;
    line(msg: string): void;
    table(rows: Array<Record<string, unknown>>): void;
    json(payload: unknown): void;
    success(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}