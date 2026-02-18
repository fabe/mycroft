import { resumeCommand } from "../resume.js";

export const registerBookResume = (program: import("commander").Command) => {
  program
    .command("resume")
    .description("Resume a pending batch ingestion")
    .argument("<id>", "Book id or prefix")
    .action(async (id: string) => {
      await resumeCommand(id);
    });
};
