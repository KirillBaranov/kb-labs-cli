import { promises as fsp } from "node:fs";
import path from "node:path";

export async function ensureDir(dir: string): Promise<void> {
    await fsp.mkdir(dir, { recursive: true });
}

export async function writeText(file: string, text: string): Promise<void> {
    await ensureDir(path.dirname(file));
    await fsp.writeFile(file, text, "utf8");
}

export async function writeJson(file: string, data: unknown): Promise<void> {
    await ensureDir(path.dirname(file));
    await fsp.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}