import { listCommand } from "../list";

export const registerBookList = (program: import("commander").Command) => {
  program
    .command("list")
    .description("List indexed books")
    .action(async () => {
      await listCommand();
    });
};
