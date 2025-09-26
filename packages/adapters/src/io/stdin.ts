import type { InputSource } from "@kb-labs/cli-core";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

export function stdinSource(): InputSource {
  return {
    async read() {
      try {
        const chunks: Buffer[] = [];
        for await (const c of process.stdin) {
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        }
        return Buffer.concat(chunks).toString("utf8");
      } catch (e) {
        throw new CliError(
          CLI_ERROR_CODES.E_IO_READ,
          "Failed to read from stdin",
          e,
        );
      }
    },
  };
}
