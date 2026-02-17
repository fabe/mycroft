import { resolveConfigCommand } from "../resolve-config.js";

export const registerConfigResolve = (program: import("commander").Command) => {
  program
    .command("resolve")
    .description("Print resolved config values")
    .action(async () => {
      await resolveConfigCommand();
    });
};
