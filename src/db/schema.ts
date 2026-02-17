import Database from "better-sqlite3";
import { resolvePaths } from "../services/constants.js";

const resolveDbPath = async () => {
  const paths = await resolvePaths();
  return paths.dbPath;
};

export const createDb = async (): Promise<ReturnType<typeof Database>> => {
  const db = new Database(await resolveDbPath());

  db.exec(`
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
      progress_chapter INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  db.exec("CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, created_at)");

  const columns = db
    .prepare("PRAGMA table_info(books)")
    .all()
    .map((col: { name: string }) => col.name);

  const ensureColumn = (name: string, definition: string) => {
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE books ADD COLUMN ${definition}`);
    }
  };

  ensureColumn("chapters", "chapters TEXT");
  ensureColumn("progress_chapter", "progress_chapter INTEGER");
  ensureColumn("summaries", "summaries TEXT");
  ensureColumn("narrative_start_index", "narrative_start_index INTEGER DEFAULT 0");
  ensureColumn("narrative_end_index", "narrative_end_index INTEGER");

  return db;
};
