import { searchCommand } from "../search.js";
import { parseQueryOptions } from "../query-options.js";

export const registerBookSearch = (program: import("commander").Command) => {
  program
    .command("search")
    .description("Vector search without LLM")
    .argument("<id>", "Book id or prefix")
    .argument("<query>", "Search query")
    .option("--top-k <n>", "Number of passages to retrieve", "5")
    .option("--max-chapter <n>", "Spoiler-free limit (0-based within narrative)")
    .addHelpText(
      "after",
      `\nEXAMPLES\n  mycroft book search 8f2c1a4b "the storm scene"\n  mycroft book search 8f2c1a4b "betrayal" --top-k 10\n`
    )
    .action(async (
      id: string,
      query: string,
      options: { topK: string; maxChapter?: string }
    ) => {
      const { topK, maxChapter } = parseQueryOptions(options);
      await searchCommand(id, query, { topK, maxChapter });
    });
};
