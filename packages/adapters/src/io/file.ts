import { promises as fsp } from "node:fs";
import type { InputSource } from "@kb-labs/cli-core";

export function fileSource(path: string): InputSource {
    return {
        async read() {
            return await fsp.readFile(path, "utf8");
        }
    };
}