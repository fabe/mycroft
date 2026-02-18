import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";

// Create an in-memory database for tests and run the schema setup directly
let testDb: ReturnType<typeof Database>;

const setupTestDb = () => {
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      cover_path TEXT,
      chapters TEXT,
      epub_path TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      indexed_at INTEGER,
      progress_chapter INTEGER,
      summaries TEXT,
      narrative_start_index INTEGER DEFAULT 0,
      narrative_end_index INTEGER,
      batch_id TEXT,
      batch_file_id TEXT,
      batch_chunks TEXT,
      ingest_state TEXT,
      ingest_resume_path TEXT,
      summary_batch_id TEXT,
      summary_batch_file_id TEXT,
      summary_batch_chapters TEXT
    );
  `);

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title TEXT,
      summary TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  testDb.exec(
    "CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, created_at)"
  );

  return testDb;
};

// Mock the schema to return our in-memory db
vi.mock("../../src/db/schema.js", () => ({
  createDb: vi.fn(async () => testDb),
}));

// Mock constants (needed by schema.ts -> resolvePaths)
vi.mock("../../src/services/constants.js", () => ({
  resolvePaths: vi.fn(async () => ({
    dataDir: "/tmp/test",
    booksDir: "/tmp/test/books",
    vectorsDir: "/tmp/test/vectors",
    ingestDir: "/tmp/test/ingest",
    dbPath: ":memory:",
  })),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

// We need to dynamically import queries after mocks are set up
// and re-import for each test since the module caches the db promise
let queries: typeof import("../../src/db/queries.js");

describe("database queries", () => {
  beforeEach(async () => {
    setupTestDb();
    // Reset module cache to get a fresh db connection for each test
    vi.resetModules();
    // Re-apply mocks after reset
    vi.doMock("../../src/db/schema.js", () => ({
      createDb: vi.fn(async () => testDb),
    }));
    vi.doMock("../../src/services/constants.js", () => ({
      resolvePaths: vi.fn(async () => ({
        dataDir: "/tmp/test",
        booksDir: "/tmp/test/books",
        vectorsDir: "/tmp/test/vectors",
        ingestDir: "/tmp/test/ingest",
        dbPath: ":memory:",
      })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
    }));
    queries = await import("../../src/db/queries.js");
  });

  describe("insertBook / getBook", () => {
    it("inserts and retrieves a book", async () => {
      const id = await queries.insertBook({
        id: "book-1",
        title: "Test Book",
        author: "Author",
        coverPath: null,
        chapters: ["Ch1", "Ch2"],
        epubPath: "/books/test.epub",
      });

      expect(id).toBe("book-1");

      const book = await queries.getBook("book-1");
      expect(book).not.toBeNull();
      expect(book!.title).toBe("Test Book");
      expect(book!.author).toBe("Author");
      expect(book!.chapters).toEqual(["Ch1", "Ch2"]);
      expect(book!.epubPath).toBe("/books/test.epub");
      expect(book!.chunkCount).toBe(0);
      expect(book!.indexedAt).toBeNull();
    });

    it("returns null for non-existent book", async () => {
      const book = await queries.getBook("non-existent");
      expect(book).toBeNull();
    });
  });

  describe("getBooks", () => {
    it("returns all books ordered by created_at DESC", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "First Book",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/a.epub",
      });
      await queries.insertBook({
        id: "book-2",
        title: "Second Book",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/b.epub",
      });

      const books = await queries.getBooks();
      expect(books).toHaveLength(2);
      // Both have the same created_at (strftime('%s','now')), so order may vary
      const titles = books.map((b) => b.title);
      expect(titles).toContain("First Book");
      expect(titles).toContain("Second Book");
    });

    it("returns empty array when no books exist", async () => {
      const books = await queries.getBooks();
      expect(books).toEqual([]);
    });
  });

  describe("updateBook", () => {
    it("updates specific fields", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Original",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      await queries.updateBook("book-1", {
        title: "Updated Title",
        chunkCount: 42,
        indexedAt: 1000000,
      });

      const book = await queries.getBook("book-1");
      expect(book!.title).toBe("Updated Title");
      expect(book!.chunkCount).toBe(42);
      expect(book!.indexedAt).toBe(1000000);
    });

    it("does nothing when no updates provided", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Original",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      await queries.updateBook("book-1", {});
      const book = await queries.getBook("book-1");
      expect(book!.title).toBe("Original");
    });

    it("updates batch-related fields", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      await queries.updateBook("book-1", {
        batchId: "batch-123",
        batchFileId: "file-456",
        ingestState: "embedding",
        ingestResumePath: "/tmp/resume.json",
      });

      const book = await queries.getBook("book-1");
      expect(book!.batchId).toBe("batch-123");
      expect(book!.batchFileId).toBe("file-456");
      expect(book!.ingestState).toBe("embedding");
      expect(book!.ingestResumePath).toBe("/tmp/resume.json");
    });
  });

  describe("deleteBook", () => {
    it("deletes a book and its data", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      await queries.deleteBook("book-1");
      const book = await queries.getBook("book-1");
      expect(book).toBeNull();
    });

    it("cascade-deletes chat sessions and messages", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      await queries.insertChatSession({
        id: "session-1",
        bookId: "book-1",
        title: "Test Chat",
        summary: null,
      });

      await queries.insertChatMessage({
        id: "msg-1",
        sessionId: "session-1",
        role: "user",
        content: "Hello",
        tokenCount: 1,
      });

      await queries.deleteBook("book-1");

      const session = await queries.getChatSession("session-1");
      expect(session).toBeNull();

      const messages = await queries.getChatMessages("session-1");
      expect(messages).toEqual([]);
    });
  });

  describe("chat sessions", () => {
    beforeEach(async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test Book",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });
    });

    it("inserts and retrieves a chat session", async () => {
      await queries.insertChatSession({
        id: "session-1",
        bookId: "book-1",
        title: "My Chat",
        summary: null,
      });

      const session = await queries.getChatSession("session-1");
      expect(session).not.toBeNull();
      expect(session!.bookId).toBe("book-1");
      expect(session!.title).toBe("My Chat");
      expect(session!.summary).toBeNull();
    });

    it("returns null for non-existent session", async () => {
      const session = await queries.getChatSession("non-existent");
      expect(session).toBeNull();
    });

    it("updates session fields", async () => {
      await queries.insertChatSession({
        id: "session-1",
        bookId: "book-1",
        title: "Original",
        summary: null,
      });

      await queries.updateChatSession("session-1", {
        title: "Updated",
        summary: "A summary of the conversation.",
        updatedAt: 999999,
      });

      const session = await queries.getChatSession("session-1");
      expect(session!.title).toBe("Updated");
      expect(session!.summary).toBe("A summary of the conversation.");
      expect(session!.updatedAt).toBe(999999);
    });

    it("lists sessions with book title JOIN", async () => {
      await queries.insertChatSession({
        id: "session-1",
        bookId: "book-1",
        title: "Chat 1",
        summary: null,
      });
      await queries.insertChatSession({
        id: "session-2",
        bookId: "book-1",
        title: "Chat 2",
        summary: null,
      });

      const sessions = await queries.listChatSessions();
      expect(sessions).toHaveLength(2);
      // Should include bookTitle from JOIN
      for (const session of sessions) {
        expect(session.bookTitle).toBe("Test Book");
      }
    });
  });

  describe("chat messages", () => {
    beforeEach(async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test Book",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });
      await queries.insertChatSession({
        id: "session-1",
        bookId: "book-1",
        title: null,
        summary: null,
      });
    });

    it("inserts and retrieves messages in chronological order", async () => {
      await queries.insertChatMessage({
        id: "msg-1",
        sessionId: "session-1",
        role: "user",
        content: "Hello",
        tokenCount: 2,
        createdAt: 100,
      });
      await queries.insertChatMessage({
        id: "msg-2",
        sessionId: "session-1",
        role: "assistant",
        content: "Hi there!",
        tokenCount: 3,
        createdAt: 101,
      });

      const messages = await queries.getChatMessages("session-1");
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[0]!.content).toBe("Hello");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[1]!.content).toBe("Hi there!");
    });

    it("returns limited messages in chronological order (most recent N)", async () => {
      for (let i = 0; i < 5; i++) {
        await queries.insertChatMessage({
          id: `msg-${i}`,
          sessionId: "session-1",
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i}`,
          tokenCount: 2,
          createdAt: 100 + i,
        });
      }

      const messages = await queries.getChatMessages("session-1", 3);
      expect(messages).toHaveLength(3);
      // Should be the last 3, in chronological order
      expect(messages[0]!.content).toBe("Message 2");
      expect(messages[1]!.content).toBe("Message 3");
      expect(messages[2]!.content).toBe("Message 4");
    });

    it("returns empty array for non-existent session", async () => {
      const messages = await queries.getChatMessages("no-session");
      expect(messages).toEqual([]);
    });
  });

  describe("getBookBatchChunks", () => {
    it("returns batch chunks JSON", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      const chunksData = JSON.stringify([{ id: "chunk-1", content: "test" }]);
      await queries.updateBook("book-1", { batchChunks: chunksData });

      const result = await queries.getBookBatchChunks("book-1");
      expect(result).toBe(chunksData);
    });

    it("returns null when no batch chunks", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      const result = await queries.getBookBatchChunks("book-1");
      expect(result).toBeNull();
    });
  });

  describe("getBookSummaryBatchChapters", () => {
    it("returns summary batch chapters JSON", async () => {
      await queries.insertBook({
        id: "book-1",
        title: "Test",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });

      const chaptersData = JSON.stringify([{ index: 0, title: "Ch1" }]);
      await queries.updateBook("book-1", { summaryBatchChapters: chaptersData });

      const result = await queries.getBookSummaryBatchChapters("book-1");
      expect(result).toBe(chaptersData);
    });
  });
});
