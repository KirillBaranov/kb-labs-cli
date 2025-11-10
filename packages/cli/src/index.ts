import { executeCli } from "./runtime/bootstrap";

export async function run(argv: string[]): Promise<number | void> {
  return executeCli(argv);
}
