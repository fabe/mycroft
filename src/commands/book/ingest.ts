import { ingestCommand } from "../ingest.js";

export const registerBookIngest = (program: import("commander").Command) => {
  const ingest = program
    .command("ingest")
    .description("Ingest an EPUB file")
    .argument("<path>", "Path to the EPUB file")
    .option("--manual", "Interactive chapter selection")
    .option("--summary", "Enable AI chapter summaries")
    .option("--batch", "Use OpenAI Batch API for embeddings (50% cost savings, up to 24h)")
    .addHelpText(
      "after",
      `\nEXAMPLES\n  mycroft book ingest ./book.epub\n  mycroft book ingest ./book.epub --summary\n  mycroft book ingest ./book.epub --batch\n\nNOTES\n  --batch submits embeddings and returns immediately.\n  Use "mycroft book resume <id>" after the batch completes to finish indexing.\n`
    )
    .action(async (path: string, options: { manual?: boolean; summary?: boolean; batch?: boolean }) => {
      const summarize = Boolean(options.summary);
      await ingestCommand(path, { manual: options.manual, summarize, batch: options.batch });
    });

  return ingest;
};
