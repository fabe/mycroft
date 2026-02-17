import { getSession, getSessionMessages } from "../../services/chat.js";
import { resolveChatSessionId } from "./utils.js";
import { stdout } from "../io.js";

export const registerChatShow = (program: import("commander").Command) => {
  program
    .command("show")
    .description("Show chat session details")
    .argument("<session>", "Chat session id or prefix")
    .option("--tail <n>", "Show last N messages", "10")
    .action(async (sessionId: string, options: { tail: string }) => {
      const tail = Number(options.tail);
      if (!Number.isFinite(tail) || tail <= 0) {
        throw new Error("--tail must be a positive number.");
      }

      const resolvedId = await resolveChatSessionId(sessionId);
      if (!resolvedId) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }
      const session = await getSession(resolvedId);
      if (!session) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }
      stdout(`ID: ${session.id}`);
      stdout(`Book ID: ${session.bookId}`);
      stdout(`Title: ${session.title ?? "-"}`);
      const updated = session.updatedAt ? new Date(session.updatedAt).toISOString() : "-";
      stdout(`Updated: ${updated}`);

      const messages = await getSessionMessages(resolvedId, tail);
      if (messages.length === 0) {
        stdout("\nNo messages yet.");
        return;
      }

      stdout("\nMessages:");
      messages.forEach((message) => {
        stdout(`[${message.role}] ${message.content}`);
      });
    });
};
