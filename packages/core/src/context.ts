import type { Logger } from "@kb-labs/core-sys/logging";
import type { Profile } from "@kb-labs/shared/profiles";
import type { Presenter } from "./presenter/types";

export interface CliContext {
    repoRoot: string;
    logger: Logger;
    presenter: Presenter;
    env: NodeJS.ProcessEnv;
    profile?: Profile; // команды могут просить профиль отдельно
}