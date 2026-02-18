import { describe, it, expect, vi } from "vitest";
import { SUMMARY_PROMPT, parseStructuredSummary, splitIntoSections, CHARS_PER_TOKEN } from "../../src/shared/summary.js";

// Mock the io module to suppress log output during tests
vi.mock("../../src/commands/io.js", () => ({
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  stdout: vi.fn(),
  stderr: vi.fn(),
}));

describe("SUMMARY_PROMPT", () => {
  it("includes the chapter title and number", () => {
    const prompt = SUMMARY_PROMPT("The Storm", 3, "Some chapter content here.", 250);
    expect(prompt).toContain("Chapter Title: The Storm");
    expect(prompt).toContain("Chapter Number: 3");
  });

  it("includes the content between delimiters", () => {
    const content = "Once upon a time there was a great adventure.";
    const prompt = SUMMARY_PROMPT("Ch1", 1, content, 250);
    expect(prompt).toContain(`---\n${content}\n---`);
  });

  it("includes the target word count", () => {
    const prompt = SUMMARY_PROMPT("Ch1", 1, "content", 300);
    expect(prompt).toContain("around 300 words");
  });

  it("requests valid JSON output", () => {
    const prompt = SUMMARY_PROMPT("Ch1", 1, "content", 250);
    expect(prompt).toContain("valid JSON");
    expect(prompt).toContain('"characters"');
    expect(prompt).toContain('"events"');
    expect(prompt).toContain('"setting"');
    expect(prompt).toContain('"revelations"');
  });
});

describe("parseStructuredSummary", () => {
  const validJSON = JSON.stringify({
    characters: ["Alice - protagonist", "Bob - antagonist"],
    events: "Alice discovers a hidden passage. Bob tries to stop her.",
    setting: "An ancient castle in the mountains.",
    revelations: "The castle holds a centuries-old secret.",
  });

  it("parses valid JSON into a ChapterSummary", () => {
    const result = parseStructuredSummary(validJSON, 2, "The Castle");
    expect(result).not.toBeNull();
    expect(result!.chapterIndex).toBe(2);
    expect(result!.chapterTitle).toBe("The Castle");
    expect(result!.characters).toEqual(["Alice - protagonist", "Bob - antagonist"]);
    expect(result!.events).toContain("Alice discovers");
    expect(result!.setting).toContain("ancient castle");
    expect(result!.revelations).toContain("centuries-old secret");
  });

  it("builds a fullSummary string", () => {
    const result = parseStructuredSummary(validJSON, 0, "Intro");
    expect(result).not.toBeNull();
    expect(result!.fullSummary).toContain("Chapter 1: Intro");
    expect(result!.fullSummary).toContain("Characters: Alice - protagonist, Bob - antagonist");
    expect(result!.fullSummary).toContain("Events:");
    expect(result!.fullSummary).toContain("Setting:");
    expect(result!.fullSummary).toContain("Revelations:");
  });

  it("handles JSON wrapped in ```json code blocks", () => {
    const wrapped = "```json\n" + validJSON + "\n```";
    const result = parseStructuredSummary(wrapped, 1, "Ch2");
    expect(result).not.toBeNull();
    expect(result!.characters).toHaveLength(2);
  });

  it("handles JSON wrapped in ``` code blocks", () => {
    const wrapped = "```\n" + validJSON + "\n```";
    const result = parseStructuredSummary(wrapped, 1, "Ch2");
    expect(result).not.toBeNull();
    expect(result!.characters).toHaveLength(2);
  });

  it("returns null for invalid JSON", () => {
    const result = parseStructuredSummary("not valid json {{{", 0, "Bad");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseStructuredSummary("", 0, "Empty");
    expect(result).toBeNull();
  });
});

describe("splitIntoSections", () => {
  it("returns the entire text as a single section if within token limit", () => {
    const text = "Short text";
    const result = splitIntoSections(text, 100);
    expect(result).toEqual([text]);
  });

  it("splits text into multiple sections when exceeding token limit", () => {
    // Each token ~4 chars, so maxTokens=10 means ~40 chars per section
    const text = "a".repeat(160); // ~40 tokens -> split into 4 sections at maxTokens=10
    const result = splitIntoSections(text, 10);
    expect(result.length).toBe(4);
    // All sections together should equal the original text
    expect(result.join("")).toBe(text);
  });

  it("distributes text approximately evenly", () => {
    const text = "a".repeat(120); // ~30 tokens
    const result = splitIntoSections(text, 10); // should be 3 sections
    expect(result.length).toBe(3);
    // Each section should be roughly 40 chars
    for (const section of result) {
      expect(section.length).toBeGreaterThanOrEqual(39);
      expect(section.length).toBeLessThanOrEqual(41);
    }
  });

  it("handles exact boundary (tokens == maxTokens)", () => {
    const text = "a".repeat(40); // exactly 10 tokens
    const result = splitIntoSections(text, 10);
    expect(result).toEqual([text]);
  });

  it("preserves total content after splitting", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(50);
    const result = splitIntoSections(text, 20);
    expect(result.join("")).toBe(text);
  });
});

describe("CHARS_PER_TOKEN", () => {
  it("is 4", () => {
    expect(CHARS_PER_TOKEN).toBe(4);
  });
});
