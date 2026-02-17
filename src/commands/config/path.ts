import { configCommand } from "../config.js";

export const registerConfigPath = (program: import("commander").Command) => {
  program
    .command("path")
    .description("Print config path")
    .action(async () => {
      await configCommand();
    });
};
