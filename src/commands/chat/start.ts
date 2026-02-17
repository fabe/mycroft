import { startSession } from "../../services/chat.js";
import { stdout } from "../io.js";

export const registerChatStart = (program: import("commander").Command) => {
  program
    .command("start")
    .description("Start a chat session for a book")
    .argument("<id>", "Book id or prefix")
    .option("--title <title>", "Session title")
    .action(async (id: string, options: { title?: string }) => {
      const session = await startSession(id, options.title);
      stdout(`Started chat session ${session.id} for book ${session.bookId}`);
    });
};
