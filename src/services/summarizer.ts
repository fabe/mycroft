import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Chapter, ChapterSummary } from "../shared/types.js";
import { SUMMARY_MAX_TOKENS, SUMMARY_CONCURRENCY, SUMMARY_TARGET_WORDS, getModels, logInfo, logWarn } from "./constants.js";

const CHARS_PER_TOKEN = 4;

const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

const SUMMARY_PROMPT = (title: string, chapterNum: number, content: string) => `You are analyzing a chapter from a book (fiction or nonfiction). Extract key information to help readers understand the chapter's content.

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

Keep the total response around ${SUMMARY_TARGET_WORDS} words.`;

type SummaryJSON = {
  characters: string[];
  events: string;
  setting: string;
  revelations: string;
};

const splitIntoSections = (text: string, maxTokens: number): string[] => {
  const estimatedTokens = estimateTokens(text);

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

const summarizeSection = async (text: string, title: string, sectionNum: number): Promise<string> => {
  const models = await getModels();
  const { text: summary } = await generateText({
    model: openai(models.summary),
    prompt: `Summarize this section from chapter "${title}" (Part ${sectionNum}). Focus on key events, characters, and revelations. Keep it concise (100-150 words):\n\n${text}`,
    temperature: 0.3,
  });

  return summary;
};

const generateStructuredSummary = async (
  content: string,
  title: string,
  chapterIndex: number
): Promise<ChapterSummary | null> => {
  try {
    const models = await getModels();
    const { text } = await generateText({
      model: openai(models.summary),
      prompt: SUMMARY_PROMPT(title, chapterIndex + 1, content),
      temperature: 0.3,
    });

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
    logWarn(`[Summarizer] Failed to parse summary JSON for "${title}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

export const summarizeChapter = async (
  chapter: Chapter,
  chapterIndex: number
): Promise<ChapterSummary | null> => {
  const tokens = estimateTokens(chapter.content);

  logInfo(`[Summarizer] Chapter ${chapterIndex + 1} "${chapter.title}": ~${tokens.toLocaleString()} tokens`);

  try {
    if (tokens < SUMMARY_MAX_TOKENS) {
      return await generateStructuredSummary(chapter.content, chapter.title, chapterIndex);
    }

    logInfo(`[Summarizer] Chapter ${chapterIndex + 1} exceeds token limit, using two-pass approach`);

    const sections = splitIntoSections(chapter.content, SUMMARY_MAX_TOKENS);
    logInfo(`[Summarizer] Split into ${sections.length} sections`);

    const sectionSummaries = await Promise.all(
      sections.map((section, i) => summarizeSection(section, chapter.title, i + 1))
    );

    const combined = sectionSummaries.join("\n\n");

    return await generateStructuredSummary(combined, chapter.title, chapterIndex);
  } catch (error) {
    logWarn(`[Summarizer] Failed to summarize chapter ${chapterIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

export const summarizeAllChapters = async (chapters: Chapter[]): Promise<ChapterSummary[]> => {
  const summaries: ChapterSummary[] = [];

  logInfo(`[Summarizer] Starting summarization of ${chapters.length} chapters (concurrency: ${SUMMARY_CONCURRENCY})`);

  for (let i = 0; i < chapters.length; i += SUMMARY_CONCURRENCY) {
    const batch = chapters.slice(i, i + SUMMARY_CONCURRENCY);
    const batchPromises = batch.map((chapter, batchIndex) => summarizeChapter(chapter, i + batchIndex));

    const batchResults = await Promise.all(batchPromises);

    for (const summary of batchResults) {
      if (summary) {
        summaries.push(summary);
      }
    }

    logInfo(`[Summarizer] Progress: ${Math.min(i + SUMMARY_CONCURRENCY, chapters.length)}/${chapters.length} chapters processed`);
  }

  logInfo(`[Summarizer] Completed: ${summaries.length}/${chapters.length} summaries generated`);

  return summaries;
};
