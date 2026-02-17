import { onboardCommand } from "../onboard.js";

export const registerConfigOnboard = (program: import("commander").Command) => {
  program
    .command("onboard")
    .description("Initialize config and show next step")
    .action(async () => {
      await onboardCommand();
    });
};
