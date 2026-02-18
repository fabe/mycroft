import { describe, it, expect } from "vitest";
import { estimateTokens, renderSources, resolveMaxChapter, formatContext } from "../../src/shared/utils.js";
import type { BookRecord } from "../../src/shared/types.js";
import type { SourceMatch } from "../../src/shared/utils.js";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("divides character count by 4 and rounds up", () => {
    expect(estimateTokens("hello")).toBe(2); // 5/4 = 1.25 -> 2
    expect(estimateTokens("hi")).toBe(1); // 2/4 = 0.5 -> 1
    expect(estimateTokens("abcd")).toBe(1); // 4/4 = 1
    expect(estimateTokens("abcde")).toBe(2); // 5/4 = 1.25 -> 2
  });

  it("handles longer text", () => {
    const text = "a".repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });
});

describe("renderSources", () => {
  it("returns empty string for no sources", () => {
    expect(renderSources([])).toBe("");
  });

  it("renders sources with chapter titles", () => {
    const sources: SourceMatch[] = [
      { content: "Some content from chapter one.", chapterTitle: "The Beginning", chapterIndex: 0 },
      { content: "Another excerpt from chapter two.", chapterTitle: "The Middle", chapterIndex: 1 },
    ];
    const result = renderSources(sources);
    expect(result).toContain("[1] The Beginning:");
    expect(result).toContain("[2] The Middle:");
    expect(result).toContain("Some content from chapter one.");
    expect(result).toContain("Another excerpt from chapter two.");
    expect(result).toMatch(/^\nSources:/);
  });

  it("falls back to Chapter N+1 when title is empty", () => {
    const sources: SourceMatch[] = [
      { content: "Some text", chapterTitle: "", chapterIndex: 2 },
    ];
    const result = renderSources(sources);
    expect(result).toContain("[1] Chapter 3:");
  });

  it("truncates content to 120 characters", () => {
    const longContent = "a".repeat(200);
    const sources: SourceMatch[] = [
      { content: longContent, chapterTitle: "Long Chapter", chapterIndex: 0 },
    ];
    const result = renderSources(sources);
    // The excerpt should be at most 120 chars
    const line = result.split("\n").find((l) => l.startsWith("[1]"));
    const excerptPart = line!.split(": ").slice(1).join(": ");
    expect(excerptPart.length).toBeLessThanOrEqual(120);
  });
});

describe("resolveMaxChapter", () => {
  const makeBook = (overrides: Partial<BookRecord> = {}): BookRecord => ({
    id: "test-id",
    title: "Test Book",
    author: null,
    coverPath: null,
    epubPath: "/test.epub",
    chunkCount: 100,
    createdAt: 0,
    indexedAt: null,
    chapters: [],
    progressChapter: null,
    narrativeStartIndex: null,
    narrativeEndIndex: null,
    batchId: null,
    batchFileId: null,
    batchChunks: null,
    ingestState: null,
    ingestResumePath: null,
    summaryBatchId: null,
    summaryBatchFileId: null,
    summaryBatchChapters: null,
    summaries: null,
    ...overrides,
  });

  it("returns undefined when no max-chapter option and no progress", () => {
    expect(resolveMaxChapter(makeBook())).toBeUndefined();
  });

  it("uses maxChapterOption + narrativeStartIndex when option is provided", () => {
    const book = makeBook({ narrativeStartIndex: 2 });
    expect(resolveMaxChapter(book, 5)).toBe(7); // 2 + 5
  });

  it("uses maxChapterOption with default narrativeStartIndex of 0", () => {
    const book = makeBook({ narrativeStartIndex: null });
    expect(resolveMaxChapter(book, 5)).toBe(5); // 0 + 5
  });

  it("prefers maxChapterOption over progressChapter", () => {
    const book = makeBook({ narrativeStartIndex: 1, progressChapter: 10 });
    expect(resolveMaxChapter(book, 3)).toBe(4); // 1 + 3
  });

  it("falls back to progressChapter when no option provided", () => {
    const book = makeBook({ narrativeStartIndex: 2, progressChapter: 8 });
    expect(resolveMaxChapter(book)).toBe(10); // 2 + 8
  });

  it("handles maxChapterOption of 0", () => {
    const book = makeBook({ narrativeStartIndex: 3 });
    expect(resolveMaxChapter(book, 0)).toBe(3); // 3 + 0
  });
});

describe("formatContext", () => {
  it("returns empty string for empty array", () => {
    expect(formatContext([])).toBe("");
  });

  it("formats chunks with chapter titles", () => {
    const chunks: SourceMatch[] = [
      { content: "First excerpt text.", chapterTitle: "Chapter One", chapterIndex: 0 },
      { content: "Second excerpt text.", chapterTitle: "Chapter Two", chapterIndex: 1 },
    ];
    const result = formatContext(chunks);
    expect(result).toContain("Excerpt [1] (Chapter One):");
    expect(result).toContain("First excerpt text.");
    expect(result).toContain("Excerpt [2] (Chapter Two):");
    expect(result).toContain("Second excerpt text.");
  });

  it("falls back to Chapter N+1 when title is empty", () => {
    const chunks: SourceMatch[] = [
      { content: "Some text", chapterTitle: "", chapterIndex: 4 },
    ];
    const result = formatContext(chunks);
    expect(result).toContain("Excerpt [1] (Chapter 5):");
  });

  it("separates excerpts with double newlines", () => {
    const chunks: SourceMatch[] = [
      { content: "A", chapterTitle: "C1", chapterIndex: 0 },
      { content: "B", chapterTitle: "C2", chapterIndex: 1 },
    ];
    const result = formatContext(chunks);
    expect(result).toContain("\n\n");
    const parts = result.split("\n\n");
    expect(parts.length).toBe(2);
  });
});
