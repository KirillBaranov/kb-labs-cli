import { promises as fsp } from "node:fs";
import type { InputSource } from "@kb-labs/cli-core";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

export function fileSource(path: string): InputSource {
  return {
    async read() {
      try {
        return await fsp.readFile(path, "utf8");
      } catch (e) {
        throw new CliError(
          CLI_ERROR_CODES.E_IO_READ,
          `Failed to read file ${path}`,
          e,
        );
      }
    },
  };
}
