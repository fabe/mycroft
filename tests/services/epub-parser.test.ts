import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Mock constants to suppress log output
vi.mock("../../src/services/constants.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { parseEpub } from "../../src/services/epub-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../fixtures/test.epub");
const hasFixture = existsSync(FIXTURE_PATH);

describe("parseEpub", () => {
  describe.skipIf(!hasFixture)("with fixture epub", () => {
    it("parses the epub and returns a ParsedBook", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.title).toBeDefined();
      expect(typeof result.title).toBe("string");
      expect(result.title.length).toBeGreaterThan(0);
    });

    it("extracts chapters with titles and content", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.chapters.length).toBeGreaterThan(0);
      for (const chapter of result.chapters) {
        expect(chapter.title).toBeDefined();
        expect(typeof chapter.title).toBe("string");
        expect(chapter.content).toBeDefined();
        expect(typeof chapter.content).toBe("string");
        expect(chapter.content.length).toBeGreaterThan(0);
      }
    });

    it("returns chapter titles matching chapters array", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.chapterTitles).toHaveLength(result.chapters.length);
      for (let i = 0; i < result.chapters.length; i++) {
        expect(result.chapterTitles[i]).toBe(result.chapters[i]!.title);
      }
    });

    it("detects narrative boundaries", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.narrativeStartIndex).toBeGreaterThanOrEqual(0);
      expect(result.narrativeEndIndex).toBeGreaterThanOrEqual(result.narrativeStartIndex);
      expect(result.narrativeEndIndex).toBeLessThan(result.chapters.length);
    });

    it("strips HTML from chapter content", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      for (const chapter of result.chapters) {
        // Should not contain HTML tags
        expect(chapter.content).not.toMatch(/<[a-z][^>]*>/i);
        // Should not contain &nbsp; entities
        expect(chapter.content).not.toContain("&nbsp;");
      }
    });

    it("returns author as string or null", async () => {
      const result = await parseEpub(FIXTURE_PATH);
      expect(result.author === null || typeof result.author === "string").toBe(true);
    });

    it("returns coverImagePath as string or null", async () => {
      const result = await parseEpub(FIXTURE_PATH);
      expect(result.coverImagePath === null || typeof result.coverImagePath === "string").toBe(true);
    });
  });

  it("throws for non-existent file", async () => {
    await expect(parseEpub("/nonexistent/path/fake.epub")).rejects.toThrow();
  });

  // Note: no "invalid file" test here. When given a non-epub file, jszip fires
  // an unhandled rejection instead of a catchable error, so there's no way to
  // assert on it without patching the upstream library.
});
