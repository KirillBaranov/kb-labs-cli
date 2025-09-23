import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

/** Thin helpers around process.env. Use core-config for real config shaping. */
export function envBool(name: string, def = false): boolean {
    const v = process.env[name];
    if (v == null) return def;
    return v === "1" || v.toLowerCase?.() === "true";
}

export function envNumber(name: string, def?: number): number | undefined {
    const v = process.env[name];
    if (v == null) {
        if (def === undefined) {
            throw new CliError(CLI_ERROR_CODES.E_ENV_MISSING_VAR, `Required environment variable ${name} is not set`);
        }
        return def;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
        if (def === undefined) {
            throw new CliError(CLI_ERROR_CODES.E_ENV_MISSING_VAR, `Environment variable ${name} has invalid number value: ${v}`);
        }
        return def;
    }
    return n;
}

export function envString(name: string, def?: string): string | undefined {
    const v = process.env[name];
    if (v == null || v === "") {
        if (def === undefined) {
            throw new CliError(CLI_ERROR_CODES.E_ENV_MISSING_VAR, `Required environment variable ${name} is not set`);
        }
        return def;
    }
    return v;
}

export function readEnv(prefix?: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (typeof v !== "string") continue;
        if (!prefix || k.startsWith(prefix)) out[k] = v;
    }
    return out;
}