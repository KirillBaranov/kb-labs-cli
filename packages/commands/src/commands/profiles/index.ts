import type { CommandGroup } from "../../types";
import { validate } from './validate';
import { resolve } from './resolve';
import { init } from './init';

export const profilesGroup: CommandGroup = {
  name: "profiles",
  describe: "Profile configuration management",
  commands: [validate, resolve, init]
};

// Back-compat re-exports (so external imports won't break)
export { validate as profilesValidate, resolve as profilesResolve, init as profilesInit };
