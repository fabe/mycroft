import { askCommand } from "../ask.js";
import { parseQueryOptions } from "../query-options.js";

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
      const { topK, maxChapter } = parseQueryOptions(options);
      await askCommand(id, question, { topK, maxChapter });
    });
};
