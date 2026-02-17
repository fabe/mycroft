import { searchCommand } from "../search";

export const registerBookSearch = (program: import("commander").Command) => {
  program
    .command("search")
    .description("Vector search without LLM")
    .argument("<id>", "Book id or prefix")
    .argument("<query>", "Search query")
    .option("--top-k <n>", "Number of passages to retrieve", "5")
    .option("--max-chapter <n>", "Spoiler-free limit (0-based within narrative)")
    .action(async (
      id: string,
      query: string,
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
      await searchCommand(id, query, { topK, maxChapter });
    });
};
