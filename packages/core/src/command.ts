import type { CliContext } from "./context";

export type FlagBuilder = (y: Record<string, unknown>) => void;

export interface CliCommand {
  /** dotted/hierarchical name: "version", "diagnose", "init.profile" */
  name: string;
  description: string;
  registerFlags?(builder: FlagBuilder): void;
  run(
    ctx: CliContext,
    argv: string[],
    flags: Record<string, unknown>,
  ): Promise<number | void> | number | void;
}
