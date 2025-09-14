/** Thin helpers around process.env. Use core-config for real config shaping. */
export function envBool(name: string, def = false): boolean {
    const v = process.env[name];
    if (v == null) return def;
    return v === "1" || v.toLowerCase?.() === "true";
}

export function envNumber(name: string, def?: number): number | undefined {
    const v = process.env[name];
    if (v == null) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

export function envString(name: string, def?: string): string | undefined {
    const v = process.env[name];
    return v == null || v === "" ? def : v;
}

export function readEnv(prefix?: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (typeof v !== "string") continue;
        if (!prefix || k.startsWith(prefix)) out[k] = v;
    }
    return out;
}