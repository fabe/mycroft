import { parseEpub } from "../services/epub-parser.js";
import { ingestEpub } from "../services/ingest.js";
import { ensureDataDirs, requireOpenAIKey } from "../services/constants.js";
import { access } from "node:fs/promises";
import { prompt } from "./prompt.js";
import { isInteractive, stdout } from "./io.js";

const parseIndexSelection = (input: string, max: number): number[] => {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  const indices = new Set<number>();
  for (const token of tokens) {
    if (token.includes("-")) {
      const [startRaw, endRaw] = token.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        if (i >= 0 && i < max) indices.add(i);
      }
    } else {
      const index = Number(token);
      if (Number.isFinite(index) && index >= 0 && index < max) indices.add(index);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
};

export const ingestCommand = async (filePath: string, options: { manual?: boolean; summarize?: boolean; batch?: boolean }) => {
  requireOpenAIKey();
  await ensureDataDirs();
  try {
    await access(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  let selectedChapterIndices: number[] | undefined;
  if (options.manual) {
    if (!isInteractive()) {
      throw new Error("Manual chapter selection requires an interactive terminal.");
    }
    const parsed = await parseEpub(filePath);
    if (parsed.chapterTitles.length === 0) {
      throw new Error("No chapters found in EPUB");
    }

    stdout("Chapters:");
    parsed.chapterTitles.forEach((title, index) => {
      const marker = index >= parsed.narrativeStartIndex && index <= parsed.narrativeEndIndex ? "*" : " ";
      stdout(`${marker} [${index}] ${title}`);
    });
    stdout("\nEnter chapter indices to ingest (e.g. 0-10,12). Press Enter for narrative range.");
    const answer = await prompt("Selection: ");
    const indices = parseIndexSelection(answer, parsed.chapterTitles.length);
    if (indices.length > 0) {
      selectedChapterIndices = indices;
    } else {
      selectedChapterIndices = Array.from(
        { length: parsed.narrativeEndIndex - parsed.narrativeStartIndex + 1 },
        (_, i) => i + parsed.narrativeStartIndex
      );
    }
  }

  const result = await ingestEpub(filePath, selectedChapterIndices, { summarize: options.summarize ?? false, batch: options.batch ?? false });
  stdout(`\nDone. Book indexed as ${result.id}`);
};
