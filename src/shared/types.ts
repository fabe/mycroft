export type BookRecord = {
  id: string;
  title: string;
  author: string | null;
  coverPath: string | null;
  epubPath: string;
  chunkCount: number;
  createdAt: number;
  indexedAt: number | null;
  chapters: string[];
  progressChapter: number | null;
  narrativeStartIndex: number | null;
  narrativeEndIndex: number | null;
};

export type Chapter = {
  title: string;
  content: string;
};

export type BookChunk = {
  id: string;
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  chunkIndex: number;
  content: string;
  type?: "chunk" | "summary";
};

export type ChapterSummary = {
  chapterIndex: number;
  chapterTitle: string;
  characters: string[];
  events: string;
  setting: string;
  revelations: string;
  fullSummary: string;
};
