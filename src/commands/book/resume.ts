import { resumeCommand } from "../resume.js";

export const registerBookResume = (
  program: import("commander").Command,
  ingest?: import("commander").Command,
) => {
  const target = ingest ?? program.command("ingest");

  target
    .command("resume")
    .description("Resume a pending batch ingestion")
    .argument("<id>", "Book id or prefix")
    .addHelpText(
      "after",
      `\nEXAMPLES\n  mycroft book ingest resume 8f2c1a4b\n\nNOTES\n  Only required for batch ingestions started with --batch.\n`
    )
    .action(async (id: string) => {
      await resumeCommand(id);
    });
};
