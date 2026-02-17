import { initConfigCommand } from "../init-config";

export const registerConfigInit = (program: import("commander").Command) => {
  program
    .command("init")
    .description("Create default config file")
    .action(async () => {
      await initConfigCommand();
    });
};
