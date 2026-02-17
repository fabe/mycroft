import { chatAsk } from "../../services/chat.js";
import { resolveChatSessionId } from "./utils.js";
import { stdout } from "../io.js";
import { parseQueryOptions } from "../query-options.js";

export const registerChatAsk = (program: import("commander").Command) => {
  program
    .command("ask")
    .description("Ask a question in a chat session")
    .argument("<session>", "Chat session id or prefix")
    .argument("<question>", "Question to ask")
    .option("--top-k <n>", "Number of passages to retrieve", "5")
    .option("--max-chapter <n>", "Spoiler-free limit (0-based within narrative)")
    .action(async (
      sessionId: string,
      question: string,
      options: { topK: string; maxChapter?: string }
    ) => {
      const { topK, maxChapter } = parseQueryOptions(options);

      const resolvedId = await resolveChatSessionId(sessionId);
      if (!resolvedId) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }
      const { answer, sources } = await chatAsk(resolvedId, question, { topK, maxChapter });
      stdout(answer);

      if (sources.length > 0) {
        stdout("\nSources:");
        sources.forEach((match, index) => {
          const title = match.chapterTitle || `Chapter ${match.chapterIndex + 1}`;
          const excerpt = match.content.slice(0, 120).replace(/\s+/g, " ");
          stdout(`[${index + 1}] ${title}: ${excerpt}`);
        });
      }
    });
};
