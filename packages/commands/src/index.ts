/**
 * @kb-labs/cli-commands
 * Public surface: типы, реестр, поиск и регистрация builtin-команд.
 * Пакет НЕ отвечает за парсинг argv/логирование/exit.
 */
export * from "./types";
export { registry, findCommand } from "./registry";
export { registerBuiltinCommands } from "./register";

export { hello } from "./commands/hello";
export { version } from "./commands/version";
export { diagnose } from "./commands/diagnose";
export { initProfile } from "./commands/init-profile";
