import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddedChunk } from "../../src/services/embedder.js";

let tempDir: string;

// Mock constants to point ensureDataDirs at our temp directory
vi.mock("../../src/services/constants.js", () => ({
  ensureDataDirs: vi.fn(async () => {
    // tempDir is set in beforeEach — this closure captures the module-level variable
    return {
      dataDir: tempDir,
      booksDir: `${tempDir}/books`,
      vectorsDir: `${tempDir}/vectors`,
      ingestDir: `${tempDir}/ingest`,
      dbPath: ":memory:",
    };
  }),
}));

describe("vector-store", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mycroft-vectra-test-"));
  });

  afterEach(async () => {
    // Clear the module cache so the indexCache resets
    vi.resetModules();
    await rm(tempDir, { recursive: true, force: true });
  });

  const loadModule = async () => {
    return await import("../../src/services/vector-store.js");
  };

  const makeChunk = (
    bookId: string,
    chapterIndex: number,
    chunkIndex: number,
    content: string,
  ): EmbeddedChunk => ({
    id: `${bookId}-ch${chapterIndex}-${chunkIndex}`,
    bookId,
    chapterIndex,
    chapterTitle: `Chapter ${chapterIndex}`,
    chunkIndex,
    content,
    type: "chunk",
    vector: Array.from({ length: 8 }, (_, i) => (chapterIndex + chunkIndex) * 0.1 + i * 0.01),
  });

  it("creates a new index for a book", async () => {
    const { createBookIndex } = await loadModule();
    const index = await createBookIndex("book-1");
    expect(index).toBeDefined();

    const exists = await index.isIndexCreated();
    expect(exists).toBe(true);
  });

  it("returns the cached index on second call", async () => {
    const { createBookIndex } = await loadModule();
    const first = await createBookIndex("book-1");
    const second = await createBookIndex("book-1");
    expect(first).toBe(second);
  });

  it("creates separate indices for different books", async () => {
    const { createBookIndex } = await loadModule();
    const idx1 = await createBookIndex("book-a");
    const idx2 = await createBookIndex("book-b");
    expect(idx1).not.toBe(idx2);
  });

  it("adds chunks and queries them back", async () => {
    const { addChunksToIndex, queryBookIndex } = await loadModule();
    const bookId = "book-query";
    const chunks = [
      makeChunk(bookId, 0, 0, "The hero embarks on a dangerous journey."),
      makeChunk(bookId, 1, 0, "A great battle ensues at the castle gates."),
      makeChunk(bookId, 2, 0, "Peace is restored to the kingdom at last."),
    ];

    await addChunksToIndex(bookId, chunks);

    // Query with the same vector as the first chunk — it should be the top result
    const results = await queryBookIndex(bookId, chunks[0]!.vector, "journey", 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(2);

    // Each result should have the expected shape
    for (const r of results) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("bookId", bookId);
      expect(r).toHaveProperty("chapterIndex");
      expect(r).toHaveProperty("content");
      expect(r).toHaveProperty("score");
    }
  });

  it("filters results by maxChapterIndex", async () => {
    const { addChunksToIndex, queryBookIndex } = await loadModule();
    const bookId = "book-filter";
    const chunks = [
      makeChunk(bookId, 0, 0, "Chapter zero content."),
      makeChunk(bookId, 1, 0, "Chapter one content."),
      makeChunk(bookId, 5, 0, "Chapter five content."),
    ];

    await addChunksToIndex(bookId, chunks);

    // With maxChapterIndex=1, chapter 5 should be excluded
    const results = await queryBookIndex(bookId, chunks[0]!.vector, "content", 10, 1);
    for (const r of results) {
      expect(r.chapterIndex).toBeLessThanOrEqual(1);
    }
  });

  it("returns results without maxChapterIndex filter", async () => {
    const { addChunksToIndex, queryBookIndex } = await loadModule();
    const bookId = "book-nofilter";
    const chunks = [
      makeChunk(bookId, 0, 0, "Early chapter."),
      makeChunk(bookId, 10, 0, "Late chapter."),
    ];

    await addChunksToIndex(bookId, chunks);

    const results = await queryBookIndex(bookId, chunks[0]!.vector, "chapter", 10);
    expect(results.length).toBe(2);
  });

  it("defaults type to 'chunk' when not specified", async () => {
    const { addChunksToIndex, queryBookIndex } = await loadModule();
    const bookId = "book-type";
    const chunk: EmbeddedChunk = {
      id: "no-type",
      bookId,
      chapterIndex: 0,
      chapterTitle: "Ch0",
      chunkIndex: 0,
      content: "Content without explicit type.",
      vector: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    };

    await addChunksToIndex(bookId, [chunk]);
    const results = await queryBookIndex(bookId, chunk.vector, "content", 1);
    expect(results[0]!.type).toBe("chunk");
  });

  it("deletes a book index", async () => {
    const { createBookIndex, deleteBookIndex } = await loadModule();
    await createBookIndex("book-del");

    // Verify it exists on disk
    const vectorsDir = `${tempDir}/vectors`;
    let entries = await readdir(vectorsDir);
    expect(entries).toContain("book-del");

    await deleteBookIndex("book-del");

    entries = await readdir(vectorsDir);
    expect(entries).not.toContain("book-del");
  });

  it("deleteBookIndex is a no-op for non-existent index", async () => {
    const { deleteBookIndex } = await loadModule();
    // Should not throw
    await expect(deleteBookIndex("nonexistent-book")).resolves.toBeUndefined();
  });
});
