import type { InputSource } from "@kb-labs/cli-core";

export function stdinSource(): InputSource {
    return {
        async read() {
            const chunks: Buffer[] = [];
            for await (const c of process.stdin) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
            return Buffer.concat(chunks).toString("utf8");
        }
    };
}