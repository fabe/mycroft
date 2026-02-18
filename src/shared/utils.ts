import type { BookRecord } from "./types.js";

const CHARS_PER_TOKEN = 4;

export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

export type SourceMatch = {
  content: string;
  chapterTitle: string;
  chapterIndex: number;
  score?: number;
  type?: "chunk" | "summary";
};

export const renderSources = (sources: SourceMatch[]): string => {
  if (sources.length === 0) return "";
  const lines = sources.map((match, index) => {
    const title = match.chapterTitle || `Chapter ${match.chapterIndex + 1}`;
    const excerpt = match.content.slice(0, 120).replace(/\s+/g, " ");
    return `[${index + 1}] ${title}: ${excerpt}`;
  });
  return `\nSources:\n${lines.join("\n")}`;
};

export const resolveMaxChapter = (
  book: BookRecord,
  maxChapterOption?: number
): number | undefined => {
  const narrativeStart = book.narrativeStartIndex ?? 0;
  const userProgress = book.progressChapter ?? null;
  if (maxChapterOption !== undefined) {
    return narrativeStart + maxChapterOption;
  }
  if (userProgress !== null) {
    return narrativeStart + userProgress;
  }
  return undefined;
};

export const formatContext = (chunks: SourceMatch[]) =>
  chunks
    .map(
      (chunk, index) =>
        `Excerpt [${index + 1}] (${chunk.chapterTitle || `Chapter ${chunk.chapterIndex + 1}`}):\n${chunk.content}`
    )
    .join("\n\n");
