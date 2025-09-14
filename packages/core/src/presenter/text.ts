import type { Presenter } from "./types";

export function createTextPresenter(): Presenter {
    const isTTY = process.stdout.isTTY === true;
    const fmt = (s: string) => s; // цвет добавим позже
    return {
        isTTY,
        section: (t) => console.log("\n" + fmt(`## ${t}`)),
        line: (m) => console.log(m),
        table: (rows) => {
            if (!rows.length) { console.log("(empty)"); return; }
            const cols = Object.keys(rows[0]!);
            const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? "").length)));
            const pad = (s: string, i: number) => s.padEnd(widths[i]!, " ");
            console.log(cols.map((c, i) => pad(c, i)).join("  "));
            console.log(widths.map(w => "-".repeat(w)).join("  "));
            for (const r of rows) console.log(cols.map((c, i) => pad(String(r[c] ?? ""), i)).join("  "));
        },
        json: (p) => console.log(JSON.stringify(p, null, 2)),
        success: (m) => console.log(m),
        warn: (m) => console.warn(m),
        error: (m) => console.error(m),
    };
}