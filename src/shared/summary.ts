import type { ChapterSummary } from "./types.js";
import { logWarn } from "../commands/io.js";

export const CHARS_PER_TOKEN = 4;

export type SummaryJSON = {
  characters: string[];
  events: string;
  setting: string;
  revelations: string;
};

export const SUMMARY_PROMPT = (title: string, chapterNum: number, content: string, targetWords: number) => `You are analyzing a chapter from a book (fiction or nonfiction). Extract key information to help readers understand the chapter's content.

Chapter Title: ${title}
Chapter Number: ${chapterNum}

---
${content}
---

Extract the following information and respond ONLY with valid JSON (no markdown, no code blocks):

{
  "characters": ["Name - brief description (role, traits, first appearance)", ...],
  "events": "What happens in this chapter? (2-3 sentences)",
  "setting": "Where does this chapter take place?",
  "revelations": "Any important information revealed? (secrets, backstory, foreshadowing)"
}

Keep the total response around ${targetWords} words.`;

export const parseStructuredSummary = (text: string, chapterIndex: number, title: string): ChapterSummary | null => {
  try {
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7, -3).trim();
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3, -3).trim();
    }

    const parsed: SummaryJSON = JSON.parse(jsonText);

    const fullSummary = `Chapter ${chapterIndex + 1}: ${title}

Characters: ${parsed.characters.join(", ")}

Events: ${parsed.events}

Setting: ${parsed.setting}

Revelations: ${parsed.revelations}`;

    return {
      chapterIndex,
      chapterTitle: title,
      characters: parsed.characters,
      events: parsed.events,
      setting: parsed.setting,
      revelations: parsed.revelations,
      fullSummary,
    };
  } catch (error) {
    logWarn(`[Summary] Failed to parse summary JSON for "${title}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

export const splitIntoSections = (text: string, maxTokens: number): string[] => {
  const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);

  if (estimatedTokens <= maxTokens) {
    return [text];
  }

  const numSections = Math.ceil(estimatedTokens / maxTokens);
  const charsPerSection = Math.floor(text.length / numSections);
  const sections: string[] = [];

  for (let i = 0; i < numSections; i++) {
    const start = i * charsPerSection;
    const end = i === numSections - 1 ? text.length : (i + 1) * charsPerSection;
    sections.push(text.slice(start, end));
  }

  return sections;
};
