import { deleteCommand } from "../delete";

export const registerBookDelete = (program: import("commander").Command) => {
  program
    .command("delete")
    .description("Remove book, EPUB, and vectors")
    .argument("<id>", "Book id or prefix")
    .option("--force", "Skip confirmation")
    .action(async (id: string, options: { force?: boolean }) => {
      await deleteCommand(id, { force: options.force });
    });
};
