import type { Chapter, BookChunk } from "../shared/types.js";
import { CHUNK_OVERLAP, CHUNK_SIZE, SEPARATORS } from "./constants.js";

const splitRecursive = (text: string, separators: readonly string[]): string[] => {
  if (text.length <= CHUNK_SIZE || separators.length === 0) return [text];
  const [separator, ...rest] = separators;
  if (!separator) return [text];

  const parts = text.split(separator);
  if (parts.length === 1) return splitRecursive(text, rest);

  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = current ? `${current}${separator}${part}` : part;
    if (next.length <= CHUNK_SIZE) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = part;
  }

  if (current) chunks.push(current);

  const refined: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= CHUNK_SIZE) {
      refined.push(chunk);
      continue;
    }
    refined.push(...splitRecursive(chunk, rest));
  }

  return refined;
};

const withOverlap = (chunks: string[]): string[] => {
  if (chunks.length <= 1 || CHUNK_OVERLAP === 0) return chunks;

  const merged: string[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const current = chunks[i] ?? "";
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(current);
      continue;
    }

    const overlap = previous.slice(-CHUNK_OVERLAP);
    merged.push(`${overlap}${current}`);
  }

  return merged;
};

export const chunkChapters = (bookId: string, chapters: Chapter[]): BookChunk[] => {
  const chunks: BookChunk[] = [];

  chapters.forEach((chapter, chapterIndex) => {
    const trimmed = chapter.content.trim();
    if (!trimmed) return;

    const rawChunks = splitRecursive(trimmed, SEPARATORS);
    const overlapped = withOverlap(rawChunks);
    overlapped.forEach((content, chunkIndex) => {
      const normalized = content.replace(/\s+/g, " ").trim();
      if (!normalized) return;
      chunks.push({
        id: `${bookId}-${chapterIndex}-${chunkIndex}`,
        bookId,
        chapterIndex,
        chapterTitle: chapter.title,
        chunkIndex,
        content: normalized,
      });
    });
  });

  return chunks;
};
