import Database from "better-sqlite3";
import type { BookRecord, ChatMessage, ChatMessageRole, ChatSession, ChatSessionSummary } from "../shared/types.js";
import { createDb } from "./schema.js";

export type BookInsert = Omit<
  BookRecord,
  "createdAt" | "indexedAt" | "chunkCount" | "progressChapter" | "narrativeStartIndex" | "narrativeEndIndex"
> & {
  chunkCount?: number;
  indexedAt?: number | null;
  progressChapter?: number | null;
  summaries?: string;
  narrativeStartIndex?: number | null;
  narrativeEndIndex?: number | null;
};

const mapRow = (row: any): BookRecord => ({
  id: row.id,
  title: row.title,
  author: row.author ?? null,
  coverPath: row.cover_path ?? null,
  epubPath: row.epub_path,
  chunkCount: row.chunk_count ?? 0,
  createdAt: row.created_at ?? 0,
  indexedAt: row.indexed_at ?? null,
  chapters: row.chapters ? JSON.parse(row.chapters) : [],
  progressChapter: row.progress_chapter ?? null,
  narrativeStartIndex: row.narrative_start_index ?? null,
  narrativeEndIndex: row.narrative_end_index ?? null,
});

let dbPromise: Promise<ReturnType<typeof Database>> | null = null;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
};

export const insertBook = async (book: BookInsert): Promise<string> => {
  const db = await getDb();
  const statement = db.prepare(
    "INSERT INTO books (id, title, author, cover_path, chapters, epub_path, chunk_count, indexed_at, progress_chapter, narrative_start_index, narrative_end_index) VALUES (@id, @title, @author, @coverPath, @chapters, @epubPath, @chunkCount, @indexedAt, @progressChapter, @narrativeStartIndex, @narrativeEndIndex)"
  );
  statement.run({
    id: book.id,
    title: book.title,
    author: book.author,
    coverPath: book.coverPath,
    chapters: JSON.stringify(book.chapters ?? []),
    epubPath: book.epubPath,
    chunkCount: book.chunkCount ?? 0,
    indexedAt: book.indexedAt ?? null,
    progressChapter: book.progressChapter ?? null,
    narrativeStartIndex: book.narrativeStartIndex ?? null,
    narrativeEndIndex: book.narrativeEndIndex ?? null,
  });
  return book.id;
};

export const updateBook = async (id: string, updates: Partial<BookInsert>) => {
  const fields: string[] = [];
  const params: Record<string, string | number | boolean | null> = { id };

  if (updates.title !== undefined) {
    fields.push("title = @title");
    params.title = updates.title;
  }
  if (updates.author !== undefined) {
    fields.push("author = @author");
    params.author = updates.author;
  }
  if (updates.coverPath !== undefined) {
    fields.push("cover_path = @coverPath");
    params.coverPath = updates.coverPath;
  }
  if (updates.chapters !== undefined) {
    fields.push("chapters = @chapters");
    params.chapters = JSON.stringify(updates.chapters);
  }
  if (updates.epubPath !== undefined) {
    fields.push("epub_path = @epubPath");
    params.epubPath = updates.epubPath;
  }
  if (updates.chunkCount !== undefined) {
    fields.push("chunk_count = @chunkCount");
    params.chunkCount = updates.chunkCount;
  }
  if (updates.indexedAt !== undefined) {
    fields.push("indexed_at = @indexedAt");
    params.indexedAt = updates.indexedAt;
  }
  if (updates.progressChapter !== undefined) {
    fields.push("progress_chapter = @progressChapter");
    params.progressChapter = updates.progressChapter;
  }
  if (updates.summaries !== undefined) {
    fields.push("summaries = @summaries");
    params.summaries = updates.summaries;
  }
  if (updates.narrativeStartIndex !== undefined) {
    fields.push("narrative_start_index = @narrativeStartIndex");
    params.narrativeStartIndex = updates.narrativeStartIndex;
  }
  if (updates.narrativeEndIndex !== undefined) {
    fields.push("narrative_end_index = @narrativeEndIndex");
    params.narrativeEndIndex = updates.narrativeEndIndex;
  }

  if (fields.length === 0) return;

  const db = await getDb();
  db.prepare(`UPDATE books SET ${fields.join(", ")} WHERE id = @id`).run(params);
};

export const getBooks = async (): Promise<BookRecord[]> => {
  const db = await getDb();
  const rows = db.prepare("SELECT * FROM books ORDER BY created_at DESC").all();
  return rows.map(mapRow);
};

export const getBook = async (id: string): Promise<BookRecord | null> => {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  return row ? mapRow(row) : null;
};

export const deleteBook = async (id: string) => {
  const db = await getDb();
  db.prepare("DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE book_id = ?)").run(id);
  db.prepare("DELETE FROM chat_sessions WHERE book_id = ?").run(id);
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
};

export type ChatSessionInsert = Omit<ChatSession, "createdAt" | "updatedAt"> & {
  createdAt?: number;
  updatedAt?: number;
};

export type ChatMessageInsert = Omit<ChatMessage, "createdAt"> & {
  createdAt?: number;
};

const mapSession = (row: any): ChatSession => ({
  id: row.id,
  bookId: row.book_id,
  title: row.title ?? null,
  summary: row.summary ?? null,
  createdAt: row.created_at ?? 0,
  updatedAt: row.updated_at ?? 0,
});

const mapSessionSummary = (row: any): ChatSessionSummary => ({
  ...mapSession(row),
  bookTitle: row.book_title ?? null,
});

const mapMessage = (row: any): ChatMessage => ({
  id: row.id,
  sessionId: row.session_id,
  role: row.role as ChatMessageRole,
  content: row.content,
  tokenCount: row.token_count ?? null,
  createdAt: row.created_at ?? 0,
});

export const insertChatSession = async (session: ChatSessionInsert): Promise<string> => {
  const db = await getDb();
  db.prepare(
    "INSERT INTO chat_sessions (id, book_id, title, summary, created_at, updated_at) VALUES (@id, @bookId, @title, @summary, @createdAt, @updatedAt)"
  ).run({
    id: session.id,
    bookId: session.bookId,
    title: session.title ?? null,
    summary: session.summary ?? null,
    createdAt: session.createdAt ?? Date.now(),
    updatedAt: session.updatedAt ?? Date.now(),
  });
  return session.id;
};

export const updateChatSession = async (id: string, updates: Partial<ChatSessionInsert>) => {
  const fields: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (updates.title !== undefined) {
    fields.push("title = @title");
    params.title = updates.title;
  }
  if (updates.summary !== undefined) {
    fields.push("summary = @summary");
    params.summary = updates.summary;
  }
  if (updates.updatedAt !== undefined) {
    fields.push("updated_at = @updatedAt");
    params.updatedAt = updates.updatedAt;
  }

  if (fields.length === 0) return;

  const db = await getDb();
  db.prepare(`UPDATE chat_sessions SET ${fields.join(", ")} WHERE id = @id`).run(params);
};

export const getChatSession = async (id: string): Promise<ChatSession | null> => {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(id);
  return row ? mapSession(row) : null;
};

export const listChatSessions = async (): Promise<ChatSessionSummary[]> => {
  const db = await getDb();
  const rows = db
    .prepare(
      "SELECT chat_sessions.*, books.title as book_title FROM chat_sessions LEFT JOIN books ON books.id = chat_sessions.book_id ORDER BY chat_sessions.updated_at DESC"
    )
    .all();
  return rows.map(mapSessionSummary);
};

export const insertChatMessage = async (message: ChatMessageInsert): Promise<string> => {
  const db = await getDb();
  db.prepare(
    "INSERT INTO chat_messages (id, session_id, role, content, token_count, created_at) VALUES (@id, @sessionId, @role, @content, @tokenCount, @createdAt)"
  ).run({
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    tokenCount: message.tokenCount ?? null,
    createdAt: message.createdAt ?? Date.now(),
  });
  return message.id;
};

export const getChatMessages = async (sessionId: string, limit?: number): Promise<ChatMessage[]> => {
  const db = await getDb();
  const rows = limit !== undefined
    ? db
      .prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(sessionId, limit)
    : db.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);

  const mapped = rows.map(mapMessage);
  return limit !== undefined ? mapped.reverse() : mapped;
};
