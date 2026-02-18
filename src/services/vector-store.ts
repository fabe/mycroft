import { LocalIndex } from "vectra";
import type { EmbeddedChunk } from "./embedder.js";
import type { BookChunk } from "../shared/types.js";
import { ensureDataDirs } from "./constants.js";

export type VectorMetadata = {
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  chunkIndex: number;
  content: string;
  type?: "chunk" | "summary";
};

const indexCache = new Map<string, LocalIndex<VectorMetadata>>();

const indexPathForBook = async (bookId: string) => {
  const paths = await ensureDataDirs();
  return `${paths.vectorsDir}/${bookId}`;
};

export const createBookIndex = async (bookId: string): Promise<LocalIndex<VectorMetadata>> => {
  const cached = indexCache.get(bookId);
  if (cached) return cached;

  const index = new LocalIndex<VectorMetadata>(await indexPathForBook(bookId));
  const exists = await index.isIndexCreated();
  if (!exists) {
    await index.createIndex({
      version: 1,
      metadata_config: {
        indexed: ["bookId"],
      },
    });
  }
  indexCache.set(bookId, index);
  return index;
};

export const addChunksToIndex = async (bookId: string, chunks: EmbeddedChunk[]) => {
  const index = await createBookIndex(bookId);
  await index.batchInsertItems(
    chunks.map((chunk) => ({
      id: chunk.id,
      vector: chunk.vector,
      metadata: {
        bookId: chunk.bookId,
        chapterIndex: chunk.chapterIndex,
        chapterTitle: chunk.chapterTitle,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        type: chunk.type || "chunk",
      },
    }))
  );
};

export const queryBookIndex = async (
  bookId: string,
  queryVector: number[],
  queryText: string,
  topK: number,
  maxChapterIndex?: number
): Promise<(BookChunk & { score: number })[]> => {
  const index = await createBookIndex(bookId);
  const expandedTopK =
    maxChapterIndex === undefined || maxChapterIndex === null ? topK : Math.max(topK * 4, topK);
  const results = await index.queryItems(queryVector, queryText, expandedTopK);

  const mapped = results.map((result: (typeof results)[number]) => ({
    id: result.item.id ?? "",
    bookId,
    chapterIndex: result.item.metadata?.chapterIndex ?? 0,
    chapterTitle: result.item.metadata?.chapterTitle ?? "",
    chunkIndex: result.item.metadata?.chunkIndex ?? 0,
    content: result.item.metadata?.content ?? "",
    type: result.item.metadata?.type as "chunk" | "summary" | undefined,
    score: result.score,
  }));

  if (maxChapterIndex === undefined || maxChapterIndex === null) {
    return mapped.slice(0, topK);
  }

  return mapped.filter((item: (typeof mapped)[number]) => item.chapterIndex <= maxChapterIndex).slice(0, topK);
};

export const deleteBookIndex = async (bookId: string) => {
  indexCache.delete(bookId);
  const index = new LocalIndex<VectorMetadata>(await indexPathForBook(bookId));
  const exists = await index.isIndexCreated();
  if (!exists) return;
  await index.deleteIndex();
};
