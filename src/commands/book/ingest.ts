import { ingestCommand } from "../ingest.js";

export const registerBookIngest = (program: import("commander").Command) => {
  const ingest = program
    .command("ingest")
    .description("Ingest an EPUB file")
    .argument("<path>", "Path to the EPUB file")
    .option("--manual", "Interactive chapter selection")
    .option("--summary", "Enable AI chapter summaries")
    .option("--batch", "Use OpenAI Batch API for embeddings and summaries (50% cost savings, up to 24h)")
    .addHelpText(
      "after",
      `\nEXAMPLES\n  mycroft book ingest ./book.epub\n  mycroft book ingest ./book.epub --summary\n  mycroft book ingest ./book.epub --batch --summary\n  mycroft book ingest status 8f2c1a4b\n  mycroft book ingest resume 8f2c1a4b\n\nNOTES\n  --batch submits work to the OpenAI Batch API and returns immediately.\n  When combined with --summary, summaries are batched first, then embeddings.\n  Use "mycroft book ingest status <id>" to check progress.\n  Use "mycroft book ingest resume <id>" to continue when a batch completes.\n  Non-batch ingests can also be resumed if interrupted.\n`
    )
    .action(async (path: string, options: { manual?: boolean; summary?: boolean; batch?: boolean }) => {
      const summarize = Boolean(options.summary);
      await ingestCommand(path, { manual: options.manual, summarize, batch: options.batch });
    });

  return ingest;
};
