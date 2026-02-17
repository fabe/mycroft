import { askCommand } from "../ask";

export const registerBookAsk = (program: import("commander").Command) => {
  program
    .command("ask")
    .description("Ask a question about a book")
    .argument("<id>", "Book id or prefix")
    .argument("<question>", "Question to ask")
    .option("--top-k <n>", "Number of passages to retrieve", "5")
    .option("--max-chapter <n>", "Spoiler-free limit (0-based within narrative)")
    .action(async (
      id: string,
      question: string,
      options: { topK: string; maxChapter?: string }
    ) => {
      const topK = Number(options.topK);
      if (!Number.isFinite(topK) || topK <= 0) {
        throw new Error("--top-k must be a positive number.");
      }
      let maxChapter: number | undefined;
      if (options.maxChapter !== undefined) {
        const parsed = Number(options.maxChapter);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error("--max-chapter must be a non-negative number.");
        }
        maxChapter = parsed;
      }
      await askCommand(id, question, { topK, maxChapter });
    });
};
