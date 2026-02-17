import { listChatSessions } from "../../db/queries.js";
import type { ChatSessionSummary } from "../../shared/types.js";

export const resolveChatSessionId = async (input: string): Promise<string | null> => {
  const sessions: ChatSessionSummary[] = await listChatSessions();
  const exact = sessions.find((session) => session.id === input);
  if (exact) return exact.id;
  const matches = sessions.filter((session) => session.id.startsWith(input));
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    throw new Error(`Ambiguous session id prefix "${input}" (${matches.length} matches)`);
  }
  return null;
};
