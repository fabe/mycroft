import { showCommand } from "../show.js";

export const registerBookShow = (program: import("commander").Command) => {
  program
    .command("show")
    .description("Show full book metadata")
    .argument("<id>", "Book id or prefix")
    .action(async (id: string) => {
      await showCommand(id);
    });
};
