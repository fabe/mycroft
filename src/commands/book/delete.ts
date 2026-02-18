import { deleteCommand } from "../delete.js";

export const registerBookDelete = (program: import("commander").Command) => {
  program
    .command("delete")
    .description("Remove book, EPUB, and vectors")
    .argument("<id>", "Book id or prefix")
    .option("--force", "Skip confirmation")
    .addHelpText(
      "after",
      `\nEXAMPLES\n  mycroft book delete 8f2c1a4b\n  mycroft book delete 8f2c1a4b --force\n`
    )
    .action(async (id: string, options: { force?: boolean }) => {
      await deleteCommand(id, { force: options.force });
    });
};
