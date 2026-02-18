import { chatAsk, getSession } from "../../services/chat.js";
import { resolveChatSessionId } from "./utils.js";
import { isInteractive, stdout } from "../io.js";
import { prompt } from "../prompt.js";
import { parseQueryOptions } from "../query-options.js";
import { renderSources } from "../../shared/utils.js";

const shouldExit = (input: string) => {
  const normalized = input.trim().toLowerCase();
  return normalized === "exit" || normalized === "quit" || normalized === ":q";
};

export const registerChatRepl = (program: import("commander").Command) => {
  program
    .command("repl")
    .description("Start interactive chat session")
    .argument("<session>", "Chat session id or prefix")
    .option("--top-k <n>", "Number of passages to retrieve", "5")
    .option("--max-chapter <n>", "Spoiler-free limit (0-based within narrative)")
    .action(async (
      sessionId: string,
      options: { topK: string; maxChapter?: string }
    ) => {
      if (!isInteractive()) {
        throw new Error("Chat repl requires an interactive terminal.");
      }
      const { topK, maxChapter } = parseQueryOptions(options);

      const resolvedId = await resolveChatSessionId(sessionId);
      if (!resolvedId) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }
      const session = await getSession(resolvedId);
      if (!session) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }

      stdout(`Chatting in session ${session.id}. Type 'exit' to quit.`);

      while (true) {
        const question = await prompt("You: ");
        if (!question.trim()) continue;
        if (shouldExit(question)) break;
        const { answer, sources } = await chatAsk(session.id, question, { topK, maxChapter });
        stdout(`\n${answer}`);
        stdout(renderSources(sources));
        stdout("");
      }
    });
};
