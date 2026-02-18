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
  // Fixture is Alice's Adventures in Wonderland (Project Gutenberg).
  // 14 chapters: Contents, 12 narrative chapters (I–XII), and the PG license.
  // Narrative boundaries: index 1 (Ch I) to 13 (license is excluded by endIndex).

  describe.skipIf(!hasFixture)("with fixture epub", () => {
    it("parses the epub and returns correct title and author", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.title).toBe("Alice's Adventures in Wonderland");
      expect(result.author).toBe("Lewis Carroll");
    });

    it("extracts all 14 chapters with content", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.chapters).toHaveLength(14);
      for (const chapter of result.chapters) {
        expect(chapter.title).toBeDefined();
        expect(typeof chapter.content).toBe("string");
        expect(chapter.content.length).toBeGreaterThan(0);
      }
    });

    it("returns chapter titles matching chapters array", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      expect(result.chapterTitles).toHaveLength(result.chapters.length);
      expect(result.chapterTitles[0]).toBe("Contents");
      expect(result.chapterTitles[1]).toBe("CHAPTER I. Down the Rabbit-Hole");
      expect(result.chapterTitles[12]).toMatch(/CHAPTER XII\. Alice.s Evidence/);
    });

    it("detects narrative boundaries (skips Contents and license)", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      // Contents is index 0 (front matter), narrative starts at 1
      expect(result.narrativeStartIndex).toBe(1);
      // 12 narrative chapters (I–XII), last narrative is index 12
      // Index 13 is the PG license, so endIndex should be 12 or 13
      // depending on whether the parser considers the license as back matter
      expect(result.narrativeEndIndex).toBeGreaterThanOrEqual(12);
      expect(result.narrativeEndIndex).toBeLessThan(result.chapters.length);
    });

    it("strips HTML from chapter content", async () => {
      const result = await parseEpub(FIXTURE_PATH);

      for (const chapter of result.chapters) {
        expect(chapter.content).not.toMatch(/<[a-z][^>]*>/i);
        expect(chapter.content).not.toContain("&nbsp;");
      }
    });

    it("returns a coverImagePath", async () => {
      const result = await parseEpub(FIXTURE_PATH);
      expect(result.coverImagePath).not.toBeNull();
      expect(typeof result.coverImagePath).toBe("string");
    });
  });

  it("throws for non-existent file", async () => {
    await expect(parseEpub("/nonexistent/path/fake.epub")).rejects.toThrow();
  });

  // Note: no "invalid file" test here. When given a non-epub file, jszip fires
  // an unhandled rejection instead of a catchable error, so there's no way to
  // assert on it without patching the upstream library.
});
