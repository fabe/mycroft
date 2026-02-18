import OpenAI from "openai";
import type { Chapter, ChapterSummary } from "../shared/types.js";
import { SUMMARY_MAX_TOKENS, SUMMARY_TARGET_WORDS, getModels, logInfo, logWarn } from "./constants.js";
import { CHARS_PER_TOKEN, SUMMARY_PROMPT, parseStructuredSummary, splitIntoSections } from "../shared/summary.js";

const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

type BatchRequestLine = {
  custom_id: string;
  method: "POST";
  url: "/v1/chat/completions";
  body: {
    model: string;
    messages: { role: "user"; content: string }[];
  };
};

export type SummaryBatchChapter = {
  chapterIndex: number;
  title: string;
  needsTwoPass: boolean;
  sectionCount: number;
};

const buildJsonl = (chapters: Chapter[], model: string): { jsonl: string; metadata: SummaryBatchChapter[] } => {
  const lines: string[] = [];
  const metadata: SummaryBatchChapter[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    const tokens = estimateTokens(chapter.content);

    if (tokens <= SUMMARY_MAX_TOKENS) {
      // Single-pass: one request for the structured summary
      const line: BatchRequestLine = {
        custom_id: `summary-${i}`,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model,
          messages: [{ role: "user", content: SUMMARY_PROMPT(chapter.title, i + 1, chapter.content, SUMMARY_TARGET_WORDS) }],
        },
      };
      lines.push(JSON.stringify(line));
      metadata.push({ chapterIndex: i, title: chapter.title, needsTwoPass: false, sectionCount: 1 });
    } else {
      // Two-pass: first submit section summary requests, then a merge request
      const sections = splitIntoSections(chapter.content, SUMMARY_MAX_TOKENS);

      for (let s = 0; s < sections.length; s++) {
        const line: BatchRequestLine = {
          custom_id: `section-${i}-${s}`,
          method: "POST",
          url: "/v1/chat/completions",
            body: {
              model,
              messages: [{
                role: "user",
                content: `Summarize this section from chapter "${chapter.title}" (Part ${s + 1}). Focus on key events, characters, and revelations. Keep it concise (100-150 words):\n\n${sections[s]}`,
              }],
            },
        };
        lines.push(JSON.stringify(line));
      }

      metadata.push({ chapterIndex: i, title: chapter.title, needsTwoPass: true, sectionCount: sections.length });
    }
  }

  return { jsonl: lines.join("\n"), metadata };
};

export type BatchSubmitResult = {
  batchId: string;
  inputFileId: string;
  metadata: SummaryBatchChapter[];
};

export const submitBatchSummaries = async (chapters: Chapter[]): Promise<BatchSubmitResult> => {
  const models = await getModels();
  const client = new OpenAI();

  logInfo(`[BatchSummarizer] Preparing batch request for ${chapters.length} chapters`);

  const { jsonl, metadata } = buildJsonl(chapters, models.summary);
  const blob = new Blob([jsonl], { type: "application/jsonl" });
  const file = await client.files.create({
    file: new File([blob], "summaries.jsonl", { type: "application/jsonl" }),
    purpose: "batch",
  });
  logInfo(`[BatchSummarizer] Uploaded input file ${file.id}`);

  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });
  logInfo(`[BatchSummarizer] Created batch ${batch.id} — status: ${batch.status}`);

  return { batchId: batch.id, inputFileId: file.id, metadata };
};

export const downloadBatchSummaryResults = async (
  outputFileId: string,
  chapters: Chapter[],
  metadata: SummaryBatchChapter[],
): Promise<{ summaries: ChapterSummary[]; needsMergePass: { chapterIndex: number; title: string; sectionSummaries: string[] }[] }> => {
  const client = new OpenAI();

  logInfo(`[BatchSummarizer] Downloading results from ${outputFileId}`);
  const response = await client.files.content(outputFileId);
  const text = await response.text();
  const lines = text.trim().split("\n");

  const results = new Map<string, string>();
  for (const line of lines) {
    let result: any;
    try {
      result = JSON.parse(line);
    } catch {
      logWarn(`[BatchSummarizer] Skipping malformed JSONL line`);
      continue;
    }
    if (result.response?.status_code === 200) {
      const content = result.response.body?.choices?.[0]?.message?.content;
      if (content) {
        results.set(result.custom_id, content);
      }
    } else {
      logWarn(`[BatchSummarizer] Request ${result.custom_id} failed: ${JSON.stringify(result.response?.body?.error ?? result.error)}`);
    }
  }

  const summaries: ChapterSummary[] = [];
  const needsMergePass: { chapterIndex: number; title: string; sectionSummaries: string[] }[] = [];

  for (const meta of metadata) {
    if (!meta.needsTwoPass) {
      // Single-pass chapter: parse the structured summary directly
      const content = results.get(`summary-${meta.chapterIndex}`);
      if (content) {
        const summary = parseStructuredSummary(content, meta.chapterIndex, meta.title);
        if (summary) summaries.push(summary);
      }
    } else {
      // Two-pass chapter: collect section summaries, need a merge pass
      const sectionSummaries: string[] = [];
      let allPresent = true;
      for (let s = 0; s < meta.sectionCount; s++) {
        const content = results.get(`section-${meta.chapterIndex}-${s}`);
        if (content) {
          sectionSummaries.push(content);
        } else {
          allPresent = false;
        }
      }
      if (allPresent && sectionSummaries.length > 0) {
        needsMergePass.push({ chapterIndex: meta.chapterIndex, title: meta.title, sectionSummaries });
      } else {
        logWarn(`[BatchSummarizer] Missing section results for chapter ${meta.chapterIndex + 1} "${meta.title}"`);
      }
    }
  }

  logInfo(`[BatchSummarizer] Parsed ${summaries.length} direct summaries, ${needsMergePass.length} chapters need merge pass`);
  return { summaries, needsMergePass };
};

/**
 * Submit a second batch for the merge pass: combine section summaries into structured summaries.
 * Returns a new batch ID for the merge requests.
 */
export const submitMergePass = async (
  mergeChapters: { chapterIndex: number; title: string; sectionSummaries: string[] }[],
): Promise<BatchSubmitResult> => {
  const models = await getModels();
  const client = new OpenAI();

  const lines: string[] = [];
  const metadata: SummaryBatchChapter[] = [];

  for (const ch of mergeChapters) {
    const combined = ch.sectionSummaries.join("\n\n");
    const line: BatchRequestLine = {
      custom_id: `summary-${ch.chapterIndex}`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: models.summary,
        messages: [{ role: "user", content: SUMMARY_PROMPT(ch.title, ch.chapterIndex + 1, combined, SUMMARY_TARGET_WORDS) }],
      },
    };
    lines.push(JSON.stringify(line));
    metadata.push({ chapterIndex: ch.chapterIndex, title: ch.title, needsTwoPass: false, sectionCount: 1 });
  }

  const jsonl = lines.join("\n");
  const blob = new Blob([jsonl], { type: "application/jsonl" });
  const file = await client.files.create({
    file: new File([blob], "summaries-merge.jsonl", { type: "application/jsonl" }),
    purpose: "batch",
  });

  logInfo(`[BatchSummarizer] Uploaded merge input file ${file.id} (${mergeChapters.length} chapters)`);

  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });
  logInfo(`[BatchSummarizer] Created merge batch ${batch.id} — status: ${batch.status}`);

  return { batchId: batch.id, inputFileId: file.id, metadata };
};

export const downloadMergeResults = async (
  outputFileId: string,
  mergeChapters: { chapterIndex: number; title: string }[],
): Promise<ChapterSummary[]> => {
  const client = new OpenAI();

  logInfo(`[BatchSummarizer] Downloading merge results from ${outputFileId}`);
  const response = await client.files.content(outputFileId);
  const text = await response.text();
  const lines = text.trim().split("\n");

  const summaries: ChapterSummary[] = [];
  for (const line of lines) {
    let result: any;
    try {
      result = JSON.parse(line);
    } catch {
      logWarn(`[BatchSummarizer] Skipping malformed JSONL line in merge results`);
      continue;
    }
    if (result.response?.status_code === 200) {
      const content = result.response.body?.choices?.[0]?.message?.content;
      if (content) {
        // Extract chapter index from custom_id: "summary-{idx}"
        const idx = Number(result.custom_id.replace("summary-", ""));
        const meta = mergeChapters.find((ch) => ch.chapterIndex === idx);
        if (meta) {
          const summary = parseStructuredSummary(content, idx, meta.title);
          if (summary) summaries.push(summary);
        }
      }
    } else {
      logWarn(`[BatchSummarizer] Merge request ${result.custom_id} failed: ${JSON.stringify(result.response?.body?.error ?? result.error)}`);
    }
  }

  logInfo(`[BatchSummarizer] Parsed ${summaries.length} merged summaries`);
  return summaries;
};
