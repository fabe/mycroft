import { listSessions } from "../../services/chat.js";
import { stdout } from "../io.js";

const formatDate = (timestamp: number | null) => {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
};

export const registerChatList = (program: import("commander").Command) => {
  program
    .command("list")
    .description("List chat sessions")
    .action(async () => {
      const sessions = await listSessions();
      if (sessions.length === 0) {
        stdout("No chat sessions yet.");
        return;
      }

      stdout("ID       | Book | Updated | Title");
      stdout("---------|------|---------|------");
      for (const session of sessions) {
        const shortId = session.id.slice(0, 8);
        const book = session.bookTitle || session.bookId.slice(0, 8);
        const updated = formatDate(session.updatedAt);
        const title = session.title || "-";
        stdout(`${shortId} | ${book} | ${updated} | ${title}`);
      }
    });
};
