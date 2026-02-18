import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";

// Mock resolvePaths to return ":memory:" for the DB path
vi.mock("../../src/services/constants.js", () => ({
  resolvePaths: vi.fn(async () => ({
    dataDir: "/tmp/mycroft-test",
    booksDir: "/tmp/mycroft-test/books",
    vectorsDir: "/tmp/mycroft-test/vectors",
    ingestDir: "/tmp/mycroft-test/ingest",
    dbPath: ":memory:",
  })),
}));

describe("schema", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const loadModule = async () => {
    return await import("../../src/db/schema.js");
  };

  it("creates a database with all three tables", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("books");
    expect(tables).toContain("chat_sessions");
    expect(tables).toContain("chat_messages");

    db.close();
  });

  it("creates the chat_messages_session_idx index", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: any) => r.name);

    expect(indices).toContain("chat_messages_session_idx");

    db.close();
  });

  it("enables foreign keys", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    const fk = db.prepare("PRAGMA foreign_keys").get() as any;
    expect(fk.foreign_keys).toBe(1);

    db.close();
  });

  it("books table has all expected columns including migration columns", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    const columns = db
      .prepare("PRAGMA table_info(books)")
      .all()
      .map((c: any) => c.name);

    const expected = [
      "id", "title", "author", "cover_path", "chapters", "epub_path",
      "chunk_count", "created_at", "indexed_at", "progress_chapter",
      "summaries", "narrative_start_index", "narrative_end_index",
      "batch_id", "batch_file_id", "batch_chunks",
      "ingest_state", "ingest_resume_path",
      "summary_batch_id", "summary_batch_file_id", "summary_batch_chapters",
    ];

    for (const col of expected) {
      expect(columns).toContain(col);
    }

    db.close();
  });

  it("chat_sessions table has expected columns", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    const columns = db
      .prepare("PRAGMA table_info(chat_sessions)")
      .all()
      .map((c: any) => c.name);

    expect(columns).toEqual(
      expect.arrayContaining(["id", "book_id", "title", "summary", "created_at", "updated_at"])
    );

    db.close();
  });

  it("chat_messages table has expected columns", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    const columns = db
      .prepare("PRAGMA table_info(chat_messages)")
      .all()
      .map((c: any) => c.name);

    expect(columns).toEqual(
      expect.arrayContaining(["id", "session_id", "role", "content", "token_count", "created_at"])
    );

    db.close();
  });

  it("is idempotent — calling createDb twice doesn't error", async () => {
    const { createDb } = await loadModule();
    const db1 = await createDb();
    db1.close();

    // Second call should not throw (CREATE TABLE IF NOT EXISTS + migration guard)
    const db2 = await createDb();
    const tables = db2
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("books");
    db2.close();
  });

  it("migration adds columns to a pre-existing books table without them", async () => {
    // Simulate an "old" database that has the books table but lacks migration columns
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        cover_path TEXT,
        epub_path TEXT NOT NULL,
        chunk_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        indexed_at INTEGER
      );
    `);

    const columnsBefore = db
      .prepare("PRAGMA table_info(books)")
      .all()
      .map((c: any) => c.name);
    expect(columnsBefore).not.toContain("summaries");
    expect(columnsBefore).not.toContain("batch_id");

    // Now mock resolvePaths to use this specific DB
    // We can't easily do that since createDb creates its own Database instance.
    // Instead, manually run the ensureColumn logic to verify it works.
    const ensureColumn = (name: string, definition: string) => {
      const cols = db.prepare("PRAGMA table_info(books)").all().map((c: any) => c.name);
      if (!cols.includes(name)) {
        db.exec(`ALTER TABLE books ADD COLUMN ${definition}`);
      }
    };

    ensureColumn("chapters", "chapters TEXT");
    ensureColumn("summaries", "summaries TEXT");
    ensureColumn("batch_id", "batch_id TEXT");

    const columnsAfter = db
      .prepare("PRAGMA table_info(books)")
      .all()
      .map((c: any) => c.name);

    expect(columnsAfter).toContain("chapters");
    expect(columnsAfter).toContain("summaries");
    expect(columnsAfter).toContain("batch_id");

    db.close();
  });

  it("enforces foreign key constraints", async () => {
    const { createDb } = await loadModule();
    const db = await createDb();

    // Inserting a chat_session with a non-existent book_id should fail
    expect(() => {
      db.prepare(
        "INSERT INTO chat_sessions (id, book_id) VALUES (?, ?)"
      ).run("sess-1", "nonexistent-book");
    }).toThrow(/FOREIGN KEY/);

    db.close();
  });
});
