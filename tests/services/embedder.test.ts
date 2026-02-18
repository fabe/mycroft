import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockEmbeddingModelV3 } from "ai/test";

// Mock constants
vi.mock("../../src/services/constants.js", () => ({
  getModels: vi.fn(async () => ({
    embedding: "text-embedding-3-small",
    summary: "gpt-4o-mini",
    chat: "gpt-4o",
  })),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

// Mock @ai-sdk/openai to return our mock embedding model
const mockEmbeddingModel = new MockEmbeddingModelV3({
  maxEmbeddingsPerCall: null, // unlimited batch size
  doEmbed: async ({ values }) => ({
    embeddings: values.map((_, i) => [0.1 * (i + 1), 0.2 * (i + 1), 0.3 * (i + 1)]),
    usage: { tokens: values.length * 5 },
    warnings: [],
  }),
});

vi.mock("@ai-sdk/openai", () => ({
  openai: Object.assign(vi.fn(), {
    embeddingModel: vi.fn(() => mockEmbeddingModel),
  }),
}));

import { embedChunks } from "../../src/services/embedder.js";
import type { BookChunk } from "../../src/shared/types.js";

const makeChunk = (index: number, contentLength = 100): BookChunk => ({
  id: `book-0-${index}`,
  bookId: "book-1",
  chapterIndex: 0,
  chapterTitle: "Chapter 1",
  chunkIndex: index,
  content: "word ".repeat(contentLength / 5),
});

describe("embedChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for no chunks", async () => {
    const result = await embedChunks([]);
    expect(result).toEqual([]);
  });

  it("embeds a single chunk", async () => {
    const chunks = [makeChunk(0)];
    const result = await embedChunks(chunks);
    expect(result).toHaveLength(1);
    expect(result[0]!.vector).toEqual([0.1, 0.2, 0.3]);
    expect(result[0]!.id).toBe("book-0-0");
    expect(result[0]!.content).toBe(chunks[0]!.content);
  });

  it("embeds multiple chunks", async () => {
    const chunks = [makeChunk(0), makeChunk(1), makeChunk(2)];
    const result = await embedChunks(chunks);
    expect(result).toHaveLength(3);
    // Each embedding should be different based on index
    expect(result[0]!.vector).toEqual([0.1, 0.2, 0.3]);
    expect(result[1]!.vector).toEqual([0.2, 0.4, 0.6]);
    expect(result[2]!.vector).toEqual([0.30000000000000004, 0.6000000000000001, 0.8999999999999999]);
  });

  it("preserves chunk metadata in results", async () => {
    const chunks = [makeChunk(5)];
    const result = await embedChunks(chunks);
    expect(result[0]!.bookId).toBe("book-1");
    expect(result[0]!.chapterIndex).toBe(0);
    expect(result[0]!.chapterTitle).toBe("Chapter 1");
    expect(result[0]!.chunkIndex).toBe(5);
  });

  it("calls onBatch callback with progress", async () => {
    const chunks = [makeChunk(0), makeChunk(1)];
    const onBatch = vi.fn();
    await embedChunks(chunks, { onBatch });
    expect(onBatch).toHaveBeenCalled();
    // Check the progress arg
    const [embeddedBatch, progress] = onBatch.mock.calls[0]!;
    expect(embeddedBatch).toHaveLength(2);
    expect(progress.batchIndex).toBe(1);
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(2);
  });

  it("batches chunks when they exceed MAX_TOKENS_PER_BATCH", async () => {
    // MAX_TOKENS_PER_BATCH is 250,000 and CHARS_PER_TOKEN is 4
    // So 250K tokens = 1M chars. Create chunks that force multiple batches.
    const bigChunk = (index: number): BookChunk => ({
      id: `book-0-${index}`,
      bookId: "book-1",
      chapterIndex: 0,
      chapterTitle: "Chapter 1",
      chunkIndex: index,
      // Each chunk is ~600K chars = ~150K tokens, so 2 chunks > 250K tokens
      content: "x".repeat(600_000),
    });

    const onBatch = vi.fn();
    const chunks = [bigChunk(0), bigChunk(1)];
    await embedChunks(chunks, { onBatch });
    // Should have been called twice (one per batch)
    expect(onBatch).toHaveBeenCalledTimes(2);

    const [, progress1] = onBatch.mock.calls[0]!;
    expect(progress1.batchIndex).toBe(1);
    expect(progress1.batchCount).toBe(2);

    const [, progress2] = onBatch.mock.calls[1]!;
    expect(progress2.batchIndex).toBe(2);
    expect(progress2.batchCount).toBe(2);
    expect(progress2.completed).toBe(2);
  });

  it("warns on empty embeddings", async () => {
    const { logWarn } = await import("../../src/services/constants.js");
    const emptyMock = new MockEmbeddingModelV3({
      maxEmbeddingsPerCall: null,
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => []),
        usage: { tokens: 0 },
        warnings: [],
      }),
    });

    const { openai } = await import("@ai-sdk/openai");
    vi.mocked(openai.embeddingModel).mockReturnValueOnce(emptyMock as any);

    const chunks = [makeChunk(0)];
    const result = await embedChunks(chunks);
    expect(result[0]!.vector).toEqual([]);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("empty embedding"));
  });
});
