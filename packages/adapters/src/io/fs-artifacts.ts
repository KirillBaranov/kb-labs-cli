import { promises as fsp } from "node:fs";
import path from "node:path";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

export async function ensureDir(dir: string): Promise<void> {
    try {
        await fsp.mkdir(dir, { recursive: true });
    } catch (e) {
        throw new CliError(CLI_ERROR_CODES.E_IO_WRITE, `Failed to create directory ${dir}`, e);
    }
}

export async function writeText(file: string, text: string): Promise<void> {
    await ensureDir(path.dirname(file));
    try {
        await fsp.writeFile(file, text, "utf8");
    } catch (e) {
        throw new CliError(CLI_ERROR_CODES.E_IO_WRITE, `Failed to write file ${file}`, e);
    }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
    await ensureDir(path.dirname(file));
    try {
        await fsp.writeFile(file, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        throw new CliError(CLI_ERROR_CODES.E_IO_WRITE, `Failed to write JSON file ${file}`, e);
    }
}