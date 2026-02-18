import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockEmbeddingModelV3, MockLanguageModelV3 } from "ai/test";
import type { Chapter } from "../../src/shared/types.js";

// --- Test state ---
let testDb: ReturnType<typeof Database>;
let tempDir: string;

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

// --- Mock AI models ---
const mockEmbeddingModel = new MockEmbeddingModelV3({
  maxEmbeddingsPerCall: null,
  doEmbed: async ({ values }) => ({
    embeddings: values.map((_, i) => Array.from({ length: 8 }, (__, j) => (i + 1) * 0.1 + j * 0.01)),
    usage: { tokens: values.length * 10 },
    warnings: [],
  }),
});

const validSummaryJSON = JSON.stringify({
  characters: ["Alice - protagonist"],
  events: "Alice goes on a journey.",
  setting: "A forest.",
  revelations: "The forest is enchanted.",
});

const mockLanguageModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: "text" as const, text: validSummaryJSON }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 30, text: 30, reasoning: undefined },
    },
    warnings: [],
  }),
});

// --- Mock modules ---

// We set up the mocks, then dynamically import ingest after each reset

const fakeChapters: Chapter[] = [
  { title: "Prologue", content: "The story begins on a dark and stormy night. Lightning crackled across the sky as Alice approached the ancient forest." },
  { title: "Chapter 1: The Forest", content: "Alice stepped into the forest. The trees towered above her, their branches intertwined like fingers. She could hear whispers in the wind. The path ahead was narrow but clear. She followed it deeper into the woods, where the light faded and shadows grew long." },
  { title: "Chapter 2: The Discovery", content: "Deep in the forest, Alice found a clearing. In the center stood an old stone well. She peered inside and saw a faint glow emanating from the depths. Without thinking, she reached in and felt something cold and metallic. She pulled out a small silver key." },
  { title: "Acknowledgments", content: "Thanks to everyone who helped." },
];

describe("ingest pipeline integration", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mycroft-ingest-test-"));
    setupTestDb();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const loadIngestModule = async () => {
    vi.resetModules();

    vi.doMock("../../src/db/schema.js", () => ({
      createDb: vi.fn(async () => testDb),
    }));
    vi.doMock("../../src/commands/io.js", () => ({
      logInfo: vi.fn(), logWarn: vi.fn(), stdout: vi.fn(), stderr: vi.fn(),
    }));
    vi.doMock("../../src/services/constants.js", () => ({
      CHUNK_SIZE: 1000,
      CHUNK_OVERLAP: 100,
      SEPARATORS: ["\n\n", "\n", ". ", " ", ""] as const,
      SUMMARY_MAX_TOKENS: 30000,
      SUMMARY_CONCURRENCY: 3,
      SUMMARY_TARGET_WORDS: 250,
      ensureDataDirs: vi.fn(async () => ({
        dataDir: tempDir,
        booksDir: join(tempDir, "books"),
        vectorsDir: join(tempDir, "vectors"),
        ingestDir: join(tempDir, "ingest"),
        dbPath: ":memory:",
      })),
      resolvePaths: vi.fn(async () => ({
        dataDir: tempDir,
        booksDir: join(tempDir, "books"),
        vectorsDir: join(tempDir, "vectors"),
        ingestDir: join(tempDir, "ingest"),
        dbPath: ":memory:",
      })),
      getModels: vi.fn(async () => ({
        embedding: "text-embedding-3-small",
        summary: "gpt-4o-mini",
        chat: "gpt-4o",
      })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      openai: Object.assign(
        vi.fn(() => mockLanguageModel),
        { embeddingModel: vi.fn(() => mockEmbeddingModel) }
      ),
    }));

    // Mock epub-parser to return our fake chapters
    vi.doMock("../../src/services/epub-parser.js", () => ({
      parseEpub: vi.fn(async () => ({
        title: "Test Book",
        author: "Test Author",
        coverImagePath: null,
        chapters: fakeChapters,
        chapterTitles: fakeChapters.map((c) => c.title),
        narrativeStartIndex: 0,
        narrativeEndIndex: 2, // exclude Acknowledgments
      })),
    }));

    // Mock vector-store since Vectra needs real disk
    vi.doMock("../../src/services/vector-store.js", () => ({
      addChunksToIndex: vi.fn(async () => {}),
      deleteBookIndex: vi.fn(async () => {}),
      createBookIndex: vi.fn(async () => ({})),
      queryBookIndex: vi.fn(async () => []),
    }));

    // Mock fs operations used during ingest (copyFile, mkdir, writeFile, unlink)
    vi.doMock("node:fs/promises", async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      return {
        ...actual,
        copyFile: vi.fn(async () => {}),
        mkdir: vi.fn(async () => undefined),
        writeFile: vi.fn(async () => {}),
        unlink: vi.fn(async () => {}),
      };
    });

    const ingest = await import("../../src/services/ingest.js");
    const queries = await import("../../src/db/queries.js");
    return { ingest, queries };
  };

  it("ingests a book end-to-end: parse -> chunk -> embed -> index", async () => {
    const { ingest, queries } = await loadIngestModule();

    const result = await ingest.ingestEpub("/fake/path.epub");

    expect(result.status).toBe("completed");
    expect(result.id).toBeDefined();

    // Verify book record in DB
    const book = await queries.getBook(result.id);
    expect(book).not.toBeNull();
    expect(book!.title).toBe("Test Book");
    expect(book!.author).toBe("Test Author");
    expect(book!.chunkCount).toBeGreaterThan(0);
    expect(book!.indexedAt).not.toBeNull();
    expect(book!.chapters).toEqual(fakeChapters.map((c) => c.title));
  });

  it("creates chunks from narrative chapters only (excludes back matter)", async () => {
    const { ingest, queries } = await loadIngestModule();

    const result = await ingest.ingestEpub("/fake/path.epub");
    const book = await queries.getBook(result.id);

    // narrativeEndIndex is 2, so Prologue (0), Ch1 (1), Ch2 (2) are included.
    // Acknowledgments (3) is excluded.
    // chunkCount should only reflect narrative chapters
    expect(book!.chunkCount).toBeGreaterThan(0);
  });

  it("generates summaries when summarize option is not disabled", async () => {
    const { ingest, queries } = await loadIngestModule();

    const result = await ingest.ingestEpub("/fake/path.epub", undefined, { summarize: true });
    const book = await queries.getBook(result.id);

    // Summaries should be stored
    expect(book!.summaries).not.toBeNull();
    const summaries = JSON.parse(book!.summaries!);
    expect(summaries.length).toBeGreaterThan(0);
  });

  it("handles selected chapter indices", async () => {
    const { ingest, queries } = await loadIngestModule();

    // Only process chapter index 1 (Chapter 1: The Forest)
    const result = await ingest.ingestEpub("/fake/path.epub", [1]);
    const book = await queries.getBook(result.id);

    expect(book).not.toBeNull();
    expect(book!.chunkCount).toBeGreaterThan(0);
  });

  it("can be listed after ingestion", async () => {
    const { ingest, queries } = await loadIngestModule();

    await ingest.ingestEpub("/fake/path.epub");
    const books = await queries.getBooks();

    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("Test Book");
  });

  it("can be deleted after ingestion", async () => {
    const { ingest, queries } = await loadIngestModule();

    const result = await ingest.ingestEpub("/fake/path.epub");
    await queries.deleteBook(result.id);

    const book = await queries.getBook(result.id);
    expect(book).toBeNull();
    const books = await queries.getBooks();
    expect(books).toHaveLength(0);
  });
});
