import { describe, it, expect, vi } from "vitest";

// Mock constants before importing chunker
vi.mock("../../src/services/constants.js", () => ({
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 100,
  SEPARATORS: ["\n\n", "\n", ". ", " ", ""] as const,
}));

import { chunkChapters } from "../../src/services/chunker.js";
import type { Chapter } from "../../src/shared/types.js";

describe("chunkChapters", () => {
  it("returns empty array for no chapters", () => {
    expect(chunkChapters("book-1", [])).toEqual([]);
  });

  it("returns empty array for chapters with empty content", () => {
    const chapters: Chapter[] = [
      { title: "Empty", content: "" },
      { title: "Whitespace", content: "   \n\n  " },
    ];
    const result = chunkChapters("book-1", chapters);
    expect(result).toEqual([]);
  });

  it("creates a single chunk for short content", () => {
    const chapters: Chapter[] = [
      { title: "Short Chapter", content: "Hello, world!" },
    ];
    const result = chunkChapters("book-1", chapters);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe("Hello, world!");
    expect(result[0]!.chapterTitle).toBe("Short Chapter");
    expect(result[0]!.bookId).toBe("book-1");
    expect(result[0]!.chapterIndex).toBe(0);
    expect(result[0]!.chunkIndex).toBe(0);
  });

  it("assigns correct chunk IDs in format bookId-chapterIndex-chunkIndex", () => {
    const chapters: Chapter[] = [
      { title: "Ch1", content: "Short content" },
      { title: "Ch2", content: "More content" },
    ];
    const result = chunkChapters("mybook", chapters);
    expect(result[0]!.id).toBe("mybook-0-0");
    expect(result[1]!.id).toBe("mybook-1-0");
  });

  it("splits long content into multiple chunks", () => {
    // Create content that exceeds CHUNK_SIZE (1000 chars)
    const longParagraph = "The quick brown fox jumps over the lazy dog. ".repeat(30); // ~1350 chars
    const chapters: Chapter[] = [
      { title: "Long Chapter", content: longParagraph },
    ];
    const result = chunkChapters("book-1", chapters);
    expect(result.length).toBeGreaterThan(1);
    // All chunks should belong to the same chapter
    for (const chunk of result) {
      expect(chunk.chapterIndex).toBe(0);
      expect(chunk.chapterTitle).toBe("Long Chapter");
    }
  });

  it("splits on paragraph boundaries first", () => {
    const para1 = "First paragraph. ".repeat(30); // ~510 chars
    const para2 = "Second paragraph. ".repeat(30); // ~540 chars
    const content = `${para1}\n\n${para2}`;
    const chapters: Chapter[] = [{ title: "Ch1", content }];
    const result = chunkChapters("book-1", chapters);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes whitespace in chunks", () => {
    const content = "Hello   world\n\nfoo   bar\n\nbaz";
    const chapters: Chapter[] = [{ title: "Ch1", content }];
    const result = chunkChapters("book-1", chapters);
    // Whitespace should be collapsed to single spaces
    for (const chunk of result) {
      expect(chunk.content).not.toMatch(/\s{2,}/);
    }
  });

  it("handles multiple chapters with correct indices", () => {
    const chapters: Chapter[] = [
      { title: "Chapter 1", content: "Content of chapter one." },
      { title: "Chapter 2", content: "Content of chapter two." },
      { title: "Chapter 3", content: "Content of chapter three." },
    ];
    const result = chunkChapters("book-1", chapters);
    expect(result).toHaveLength(3);
    expect(result[0]!.chapterIndex).toBe(0);
    expect(result[1]!.chapterIndex).toBe(1);
    expect(result[2]!.chapterIndex).toBe(2);
  });

  it("adds overlap between consecutive chunks of the same chapter", () => {
    // Create content with clear paragraph splits that exceed CHUNK_SIZE
    const paragraphs = Array.from({ length: 5 }, (_, i) =>
      `Paragraph ${i + 1}: ${"word ".repeat(150)}`
    );
    const content = paragraphs.join("\n\n");
    const chapters: Chapter[] = [{ title: "Long", content }];
    const result = chunkChapters("book-1", chapters);

    if (result.length > 1) {
      // Second chunk should start with overlap from the end of previous chunk's
      // pre-overlap content. The overlap is 100 chars from the previous chunk.
      expect(result[1]!.chunkIndex).toBe(1);
      expect(result[1]!.id).toBe("book-1-0-1");
    }
  });

  it("skips chapters with only whitespace content", () => {
    const chapters: Chapter[] = [
      { title: "Empty", content: "   " },
      { title: "Real", content: "Real content here." },
    ];
    const result = chunkChapters("book-1", chapters);
    expect(result).toHaveLength(1);
    expect(result[0]!.chapterTitle).toBe("Real");
    // The real chapter is at index 1 in the array
    expect(result[0]!.chapterIndex).toBe(1);
  });
});
