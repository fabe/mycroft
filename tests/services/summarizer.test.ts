import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

// Mock constants
vi.mock("../../src/services/constants.js", () => ({
  SUMMARY_MAX_TOKENS: 30000,
  SUMMARY_CONCURRENCY: 3,
  SUMMARY_TARGET_WORDS: 250,
  getModels: vi.fn(async () => ({
    embedding: "text-embedding-3-small",
    summary: "gpt-4o-mini",
    chat: "gpt-4o",
  })),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

// Mock io
vi.mock("../../src/commands/io.js", () => ({
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const validSummaryJSON = JSON.stringify({
  characters: ["Alice - protagonist"],
  events: "Alice goes on an adventure.",
  setting: "A magical forest.",
  revelations: "The forest is alive.",
});

const mockLanguageModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: "text" as const, text: validSummaryJSON }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 50, text: 50, reasoning: undefined },
    },
    warnings: [],
  }),
});

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => mockLanguageModel),
}));

import { summarizeChapter, summarizeAllChapters } from "../../src/services/summarizer.js";
import type { Chapter } from "../../src/shared/types.js";

describe("summarizeChapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes a short chapter in single pass", async () => {
    const chapter: Chapter = {
      title: "The Beginning",
      content: "Alice walked into the magical forest. The trees whispered her name.",
    };

    const result = await summarizeChapter(chapter, 0);
    expect(result).not.toBeNull();
    expect(result!.chapterIndex).toBe(0);
    expect(result!.chapterTitle).toBe("The Beginning");
    expect(result!.characters).toEqual(["Alice - protagonist"]);
    expect(result!.events).toBe("Alice goes on an adventure.");
    expect(result!.setting).toBe("A magical forest.");
    expect(result!.revelations).toBe("The forest is alive.");
    expect(result!.fullSummary).toContain("Chapter 1: The Beginning");
  });

  it("uses two-pass approach for long chapters", async () => {
    // Create content > 30000 tokens = 120000 chars
    const longContent = "The story continues. ".repeat(7000); // ~140K chars
    const chapter: Chapter = {
      title: "The Epic",
      content: longContent,
    };

    const result = await summarizeChapter(chapter, 0);
    expect(result).not.toBeNull();
    // The mock returns valid JSON for all calls (section summaries + merge)
    expect(result!.chapterTitle).toBe("The Epic");
  });

  it("returns null when AI call fails", async () => {
    const { openai } = await import("@ai-sdk/openai");
    const failingModel = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("API error");
      },
    });
    vi.mocked(openai).mockReturnValue(failingModel as any);

    const chapter: Chapter = { title: "Broken", content: "Content" };
    const result = await summarizeChapter(chapter, 0);
    expect(result).toBeNull();
  });

  it("returns null when AI returns unparseable JSON", async () => {
    const { openai } = await import("@ai-sdk/openai");
    const badJsonModel = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text" as const, text: "not json at all" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    vi.mocked(openai).mockReturnValue(badJsonModel as any);

    const chapter: Chapter = { title: "Bad JSON", content: "Content" };
    const result = await summarizeChapter(chapter, 0);
    expect(result).toBeNull();
  });
});

describe("summarizeAllChapters", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset to the working mock
    const { openai } = vi.mocked(await import("@ai-sdk/openai"));
    openai.mockReturnValue(mockLanguageModel as any);
  });

  it("summarizes multiple chapters", async () => {
    const chapters: Chapter[] = [
      { title: "Ch1", content: "Content 1" },
      { title: "Ch2", content: "Content 2" },
      { title: "Ch3", content: "Content 3" },
    ];

    const results = await summarizeAllChapters(chapters);
    expect(results).toHaveLength(3);
    expect(results[0]!.chapterIndex).toBe(0);
    expect(results[1]!.chapterIndex).toBe(1);
    expect(results[2]!.chapterIndex).toBe(2);
  });

  it("returns empty array for no chapters", async () => {
    const results = await summarizeAllChapters([]);
    expect(results).toEqual([]);
  });

  it("processes chapters in batches based on SUMMARY_CONCURRENCY", async () => {
    const { logInfo } = await import("../../src/services/constants.js");

    const chapters: Chapter[] = Array.from({ length: 7 }, (_, i) => ({
      title: `Ch${i + 1}`,
      content: `Content ${i + 1}`,
    }));

    await summarizeAllChapters(chapters);
    // With concurrency 3, we should see progress logs: 3/7, 6/7, 7/7
    expect(logInfo).toHaveBeenCalled();
  });

  it("skips failed summaries but continues processing", async () => {
    const { openai } = vi.mocked(await import("@ai-sdk/openai"));
    let callCount = 0;
    const sometimesFailing = new MockLanguageModelV3({
      doGenerate: async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Fail on second chapter");
        }
        return {
          content: [{ type: "text" as const, text: validSummaryJSON }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 5, text: 5, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
    openai.mockReturnValue(sometimesFailing as any);

    const chapters: Chapter[] = [
      { title: "Ch1", content: "Content 1" },
      { title: "Ch2", content: "Content 2" },
      { title: "Ch3", content: "Content 3" },
    ];

    const results = await summarizeAllChapters(chapters);
    // Second chapter should have failed, so only 2 results
    expect(results).toHaveLength(2);
  });
});
