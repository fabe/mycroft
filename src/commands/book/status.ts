import { statusCommand } from "../status.js";

export const registerBookStatus = (
  program: import("commander").Command,
  ingest?: import("commander").Command,
) => {
  const target = ingest ?? program.command("ingest");

  target
    .command("status")
    .description("Check ingestion status for a book")
    .argument("<id>", "Book id or prefix")
    .addHelpText(
      "after",
      `\nEXAMPLES\n  mycroft book ingest status 8f2c1a4b\n\nNOTES\n  For batch ingests, queries the OpenAI API for live progress.\n  For local ingests, shows how many chunks have been completed.\n`
    )
    .action(async (id: string) => {
      await statusCommand(id);
    });
};
