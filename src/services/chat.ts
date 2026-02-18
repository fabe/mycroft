import { randomUUID } from "node:crypto";
import { embed, generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getBook, getChatMessages, getChatSession, insertChatMessage, insertChatSession, listChatSessions, updateChatSession } from "../db/queries.js";
import type { ChatMessage, ChatSession, ChatSessionSummary } from "../shared/types.js";
import { ensureDataDirs, getModels, isAskEnabled, requireOpenAIKey } from "./constants.js";
import { queryBookIndex } from "./vector-store.js";
import { resolveBookId } from "../commands/utils.js";
import { estimateTokens, formatContext, resolveMaxChapter } from "../shared/utils.js";

const MAX_RECENT_MESSAGES = 12;
const SUMMARY_TRIGGER_MESSAGES = 24;
const SUMMARY_TARGET_WORDS = 160;

type ChatAskOptions = {
  topK: number;
  maxChapter?: number;
};

const summarizeMessages = async (messages: ChatMessage[]): Promise<string> => {
  const transcript = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const models = await getModels();
  const { text } = await generateText({
    model: openai(models.summary),
    prompt: `Summarize this conversation so far in ~${SUMMARY_TARGET_WORDS} words. Focus on facts, decisions, and unresolved questions.\n\n${transcript}`,
  });
  return text.trim();
};

const buildConversationContext = (session: ChatSession, messages: ChatMessage[]) => {
  const summary = session.summary ? `Conversation summary:\n${session.summary}` : "";
  const recent = messages
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  return [summary, recent].filter(Boolean).join("\n\n");
};

const maybeSummarizeSession = async (session: ChatSession, messages: ChatMessage[], updatedAt: number) => {
  if (messages.length < SUMMARY_TRIGGER_MESSAGES) return;
  const summary = await summarizeMessages(messages.slice(0, -MAX_RECENT_MESSAGES));
  await updateChatSession(session.id, { summary, updatedAt });
};

export const listSessions = async (): Promise<ChatSessionSummary[]> => listChatSessions();

export const getSession = async (id: string): Promise<ChatSession | null> => getChatSession(id);

export const getSessionMessages = async (sessionId: string, limit?: number) => getChatMessages(sessionId, limit);

export const startSession = async (bookId: string, title?: string): Promise<ChatSession> => {
  await ensureDataDirs();
  const resolvedId = await resolveBookId(bookId);
  if (!resolvedId) {
    throw new Error(`Book not found: ${bookId}`);
  }
  const sessionId = randomUUID();
  await insertChatSession({
    id: sessionId,
    bookId: resolvedId,
    title: title ?? null,
    summary: null,
  });
  const session = await getChatSession(sessionId);
  if (!session) {
    throw new Error("Failed to create chat session.");
  }
  return session;
};

export const chatAsk = async (sessionId: string, question: string, options: ChatAskOptions) => {
  if (!(await isAskEnabled())) {
    throw new Error("Ask is disabled in config (askEnabled: false). Enable it to use this command.");
  }
  requireOpenAIKey();
  await ensureDataDirs();

  const session = await getChatSession(sessionId);
  if (!session) {
    throw new Error(`Chat session not found: ${sessionId}`);
  }
  const book = await getBook(session.bookId);
  if (!book) {
    throw new Error(`Book not found: ${session.bookId}`);
  }

  const models = await getModels();
  const { embedding } = await embed({
    model: openai.embeddingModel(models.embedding),
    value: question,
  });

  const maxChapterIndex = resolveMaxChapter(book, options.maxChapter);

  const retrievalLimit = options.topK * 3;
  const allMatches = await queryBookIndex(session.bookId, embedding, question, retrievalLimit, maxChapterIndex);
  const summaries = allMatches.filter((m) => m.type === "summary");
  const chunks = allMatches.filter((m) => m.type !== "summary");
  const topSummaries = summaries.slice(0, 2);
  const topChunks = chunks.slice(0, Math.max(0, options.topK - topSummaries.length));
  const selectedMatches = [...topSummaries, ...topChunks];
  const context = formatContext(selectedMatches);

  const messages = await getChatMessages(sessionId);
  const conversation = buildConversationContext(session, messages);

  const now = Math.floor(Date.now() / 1000);

  const prompt = [
    conversation ? `Conversation:\n${conversation}` : "",
    `Question: ${question}`,
    context,
  ].filter(Boolean).join("\n\n");

  const stream = streamText({
    model: openai(models.chat),
    system: `You are a reading companion helping readers understand this book.\n\nGuidelines:\n- Use the provided chapter summaries and excerpts to answer questions\n- Chapter summaries provide high-level context about characters, events, and plot\n- Excerpts provide specific details and quotes\n- When asked for recaps or "what happened", synthesize from summaries\n- Don't cite table of contents, front matter, or structural elements\n- If truly unsure, briefly say so - but try to answer from available context first\n- Cite sources using [1], [2], etc. at the end of relevant sentences\n- The context may be limited to earlier chapters only - don't infer beyond what's provided`,
    prompt,
  });

  const text = await stream.text;

  // Insert both messages only after successful AI response
  const userMessage: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role: "user",
    content: question,
    tokenCount: estimateTokens(question),
    createdAt: now,
  };
  await insertChatMessage(userMessage);

  const assistantMessage: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role: "assistant",
    content: text,
    tokenCount: estimateTokens(text),
    createdAt: now,
  };
  await insertChatMessage(assistantMessage);
  const updatedAt = Math.floor(Date.now() / 1000);
  await updateChatSession(sessionId, { updatedAt });
  await maybeSummarizeSession(session, [...messages, userMessage, assistantMessage], updatedAt);

  return { answer: text, sources: selectedMatches };
};
