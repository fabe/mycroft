import { chatAsk } from "../../services/chat.js";
import { resolveChatSessionId } from "./utils.js";
import { stdout } from "../io.js";
import { parseQueryOptions } from "../query-options.js";
import { renderSources } from "../../shared/utils.js";

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
      stdout(renderSources(sources));
    });
};
