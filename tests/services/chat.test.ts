import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { MockEmbeddingModelV3, MockLanguageModelV3, simulateReadableStream } from "ai/test";

// --- In-memory DB setup ---
let testDb: ReturnType<typeof Database>;

const setupTestDb = () => {
  testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, cover_path TEXT,
      chapters TEXT, epub_path TEXT NOT NULL, chunk_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')), indexed_at INTEGER,
      progress_chapter INTEGER, summaries TEXT,
      narrative_start_index INTEGER DEFAULT 0, narrative_end_index INTEGER,
      batch_id TEXT, batch_file_id TEXT, batch_chunks TEXT,
      ingest_state TEXT, ingest_resume_path TEXT,
      summary_batch_id TEXT, summary_batch_file_id TEXT, summary_batch_chapters TEXT
    );
  `);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title TEXT, summary TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL, token_count INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
  testDb.exec(
    "CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, created_at)"
  );
  return testDb;
};

// --- Mocks ---

// Mock schema
vi.mock("../../src/db/schema.js", () => ({
  createDb: vi.fn(async () => testDb),
}));

// Mock io
vi.mock("../../src/commands/io.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  stdout: vi.fn(),
  stderr: vi.fn(),
}));

// Mock constants
vi.mock("../../src/services/constants.js", () => ({
  ensureDataDirs: vi.fn(async () => ({
    dataDir: "/tmp/test",
    booksDir: "/tmp/test/books",
    vectorsDir: "/tmp/test/vectors",
    ingestDir: "/tmp/test/ingest",
    dbPath: ":memory:",
  })),
  getModels: vi.fn(async () => ({
    embedding: "text-embedding-3-small",
    summary: "gpt-4o-mini",
    chat: "gpt-4o",
  })),
  isAskEnabled: vi.fn(async () => true),
  requireOpenAIKey: vi.fn(),
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

// Mock the resolveBookId command util
vi.mock("../../src/commands/utils.js", () => ({
  resolveBookId: vi.fn(async (id: string) => id),
}));

// Mock vector store
const mockQueryResults = [
  {
    id: "book-1-0-0",
    bookId: "book-1",
    chapterIndex: 0,
    chapterTitle: "Chapter 1",
    chunkIndex: 0,
    content: "The hero entered the dark forest.",
    type: "chunk" as const,
    score: 0.95,
  },
  {
    id: "book-1-summary-0",
    bookId: "book-1",
    chapterIndex: 0,
    chapterTitle: "Chapter 1",
    chunkIndex: 0,
    content: "Summary: The hero begins the journey.",
    type: "summary" as const,
    score: 0.90,
  },
];

vi.mock("../../src/services/vector-store.js", () => ({
  queryBookIndex: vi.fn(async () => mockQueryResults),
}));

// Mock AI SDK models
const mockEmbeddingModel = new MockEmbeddingModelV3({
  maxEmbeddingsPerCall: null,
  doEmbed: async ({ values }) => ({
    embeddings: values.map(() => [0.1, 0.2, 0.3]),
    usage: { tokens: 10 },
    warnings: [],
  }),
});

const mockLanguageModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: "text" as const, text: "This is a conversation summary." }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 50, text: 50, reasoning: undefined },
    },
    warnings: [],
  }),
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: "The hero " },
        { type: "text-delta" as const, id: "text-1", delta: "goes on an adventure." },
        { type: "text-end" as const, id: "text-1" },
        {
          type: "finish" as const,
          finishReason: { unified: "stop" as const, raw: undefined },
          logprobs: undefined,
          providerMetadata: undefined,
          usage: {
            inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
        },
      ],
    }),
  }),
});

vi.mock("@ai-sdk/openai", () => ({
  openai: Object.assign(
    vi.fn(() => mockLanguageModel),
    {
      embeddingModel: vi.fn(() => mockEmbeddingModel),
    }
  ),
}));

// Now import chat service
let chatService: typeof import("../../src/services/chat.js");
let queriesModule: typeof import("../../src/db/queries.js");

describe("chat service", () => {
  beforeEach(async () => {
    setupTestDb();
    vi.resetModules();

    // Re-apply mocks after module reset
    vi.doMock("../../src/db/schema.js", () => ({
      createDb: vi.fn(async () => testDb),
    }));
    vi.doMock("../../src/commands/io.js", () => ({
      logInfo: vi.fn(), logWarn: vi.fn(), stdout: vi.fn(), stderr: vi.fn(),
    }));
    vi.doMock("../../src/services/constants.js", () => ({
      ensureDataDirs: vi.fn(async () => ({
        dataDir: "/tmp/test", booksDir: "/tmp/test/books",
        vectorsDir: "/tmp/test/vectors", ingestDir: "/tmp/test/ingest", dbPath: ":memory:",
      })),
      getModels: vi.fn(async () => ({
        embedding: "text-embedding-3-small", summary: "gpt-4o-mini", chat: "gpt-4o",
      })),
      isAskEnabled: vi.fn(async () => true),
      requireOpenAIKey: vi.fn(),
      resolvePaths: vi.fn(async () => ({
        dataDir: "/tmp/test", booksDir: "/tmp/test/books",
        vectorsDir: "/tmp/test/vectors", ingestDir: "/tmp/test/ingest", dbPath: ":memory:",
      })),
      logInfo: vi.fn(), logWarn: vi.fn(),
    }));
    vi.doMock("../../src/commands/utils.js", () => ({
      resolveBookId: vi.fn(async (id: string) => id),
    }));
    vi.doMock("../../src/services/vector-store.js", () => ({
      queryBookIndex: vi.fn(async () => mockQueryResults),
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      openai: Object.assign(
        vi.fn(() => mockLanguageModel),
        { embeddingModel: vi.fn(() => mockEmbeddingModel) }
      ),
    }));

    queriesModule = await import("../../src/db/queries.js");
    chatService = await import("../../src/services/chat.js");
  });

  const seedBook = async () => {
    await queriesModule.insertBook({
      id: "book-1",
      title: "Test Book",
      author: "Author",
      coverPath: null,
      chapters: ["Chapter 1", "Chapter 2"],
      epubPath: "/books/test.epub",
    });
  };

  describe("startSession", () => {
    it("creates a new chat session tied to a book", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1", "My Chat");
      expect(session.bookId).toBe("book-1");
      expect(session.title).toBe("My Chat");
      expect(session.id).toBeDefined();
      expect(session.summary).toBeNull();
    });

    it("creates a session without a title", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1");
      expect(session.title).toBeNull();
    });

    it("throws for non-existent book", async () => {
      // resolveBookId mock returns the input, but getBook will return null
      const { resolveBookId } = await import("../../src/commands/utils.js");
      vi.mocked(resolveBookId).mockResolvedValueOnce(null);

      await expect(chatService.startSession("nonexistent")).rejects.toThrow("Book not found");
    });
  });

  describe("listSessions", () => {
    it("returns all sessions", async () => {
      await seedBook();
      await chatService.startSession("book-1", "Chat 1");
      await chatService.startSession("book-1", "Chat 2");

      const sessions = await chatService.listSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe("getSession", () => {
    it("retrieves a specific session", async () => {
      await seedBook();
      const created = await chatService.startSession("book-1", "Test");
      const retrieved = await chatService.getSession(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it("returns null for non-existent session", async () => {
      const result = await chatService.getSession("no-such-session");
      expect(result).toBeNull();
    });
  });

  describe("getSessionMessages", () => {
    it("returns messages for a session", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1");

      // Insert messages directly
      await queriesModule.insertChatMessage({
        id: "msg-1",
        sessionId: session.id,
        role: "user",
        content: "Hello",
        tokenCount: 2,
        createdAt: 100,
      });

      const messages = await chatService.getSessionMessages(session.id);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe("Hello");
    });
  });

  describe("chatAsk", () => {
    it("returns an answer and sources", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1");

      const result = await chatService.chatAsk(session.id, "What happens in chapter 1?", {
        topK: 5,
      });

      expect(result.answer).toBe("The hero goes on an adventure.");
      expect(result.sources).toBeDefined();
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it("persists user and assistant messages in the database", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1");

      await chatService.chatAsk(session.id, "What happens?", { topK: 5 });

      const messages = await chatService.getSessionMessages(session.id);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[0]!.content).toBe("What happens?");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[1]!.content).toBe("The hero goes on an adventure.");
    });

    it("throws when askEnabled is false", async () => {
      const constants = await import("../../src/services/constants.js");
      vi.mocked(constants.isAskEnabled).mockResolvedValueOnce(false);

      await seedBook();
      const session = await chatService.startSession("book-1");

      await expect(
        chatService.chatAsk(session.id, "Question?", { topK: 5 })
      ).rejects.toThrow("Ask is disabled");
    });

    it("throws for non-existent session", async () => {
      await expect(
        chatService.chatAsk("no-session", "Question?", { topK: 5 })
      ).rejects.toThrow("Chat session not found");
    });

    it("throws when book no longer exists", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1");
      // Delete the book after creating the session
      await queriesModule.deleteBook("book-1");

      // Re-create the session record since cascade deleted it
      await queriesModule.insertBook({
        id: "book-2",
        title: "Temp",
        author: null,
        coverPath: null,
        chapters: [],
        epubPath: "/test.epub",
      });
      await queriesModule.insertChatSession({
        id: "orphan-session",
        bookId: "book-2",
        title: null,
        summary: null,
      });
      // Now delete book-2 but keep the session reference
      // Actually, let's test differently - create session pointing to non-existent book
      testDb.pragma("foreign_keys = OFF");
      testDb.prepare(
        "INSERT INTO chat_sessions (id, book_id, title) VALUES (?, ?, ?)"
      ).run("bad-session", "deleted-book", null);
      testDb.pragma("foreign_keys = ON");

      await expect(
        chatService.chatAsk("bad-session", "Question?", { topK: 5 })
      ).rejects.toThrow("Book not found");
    });

    it("uses maxChapter option for spoiler-free queries", async () => {
      await seedBook();
      const session = await chatService.startSession("book-1");

      const { queryBookIndex } = await import("../../src/services/vector-store.js");

      await chatService.chatAsk(session.id, "What happens?", {
        topK: 3,
        maxChapter: 5,
      });

      expect(queryBookIndex).toHaveBeenCalledWith(
        "book-1",
        expect.any(Array),
        "What happens?",
        expect.any(Number),
        expect.any(Number) // maxChapterIndex should be resolved
      );
    });
  });
});
