export type IngestState = "pending" | "embedding" | "summarizing" | null;

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
  batchId: string | null;
  batchFileId: string | null;
  batchChunks: string | null;
  ingestState: IngestState;
  ingestResumePath: string | null;
  summaryBatchId: string | null;
  summaryBatchFileId: string | null;
  summaryBatchChapters: string | null;
  summaries: string | null;
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

export type ChatSession = {
  id: string;
  bookId: string;
  title: string | null;
  summary: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ChatSessionSummary = ChatSession & {
  bookTitle: string | null;
};

export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  tokenCount: number | null;
  createdAt: number;
};
