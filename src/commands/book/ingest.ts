import { ingestCommand } from "../ingest";

export const registerBookIngest = (program: import("commander").Command) => {
  program
    .command("ingest")
    .description("Ingest an EPUB file")
    .argument("<path>", "Path to the EPUB file")
    .option("--manual", "Interactive chapter selection")
    .option("--summary", "Enable AI chapter summaries")
    .action(async (path: string, options: { manual?: boolean; summary?: boolean }) => {
      const summarize = Boolean(options.summary);
      await ingestCommand(path, { manual: options.manual, summarize });
    });
};
