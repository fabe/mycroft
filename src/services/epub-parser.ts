import { initEpubFile } from "@lingo-reader/epub-parser";
import { basename } from "node:path";
import type { Chapter } from "../shared/types.js";
import { logInfo } from "./constants.js";

export type ParsedBook = {
  title: string;
  author: string | null;
  coverImagePath: string | null;
  chapters: Chapter[];
  chapterTitles: string[];
  narrativeStartIndex: number;
  narrativeEndIndex: number;
};

const detectNarrativeBoundaries = (chapterTitles: string[]): { start: number; end: number } => {
  const frontMatterPattern = /^(about|contents|table of contents|dedication|preface|foreword|title|half.?title|copyright|epigraph|frontispiece|map)/i;
  const backMatterPattern = /^(acknowledgment|afterword|appendix|glossary|index|bibliography|about the author|also by|praise|copyright page|notes|bonus|preview|excerpt|major characters|locations)/i;
  const narrativePattern = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|1|2|3|4|5|6|7|8|9|one|two|three|chapter|prologue|epilogue|part\s)/i;

  let start = 0;
  let end = chapterTitles.length - 1;

  for (let i = 0; i < chapterTitles.length; i++) {
    const title = chapterTitles[i]?.trim() || "";

    if (narrativePattern.test(title) && !frontMatterPattern.test(title)) {
      start = i;
      break;
    }

    if (!frontMatterPattern.test(title) && title.length > 0) {
      if (title.length > 3) {
        start = i;
        break;
      }
    }
  }

  for (let i = chapterTitles.length - 1; i >= start; i--) {
    const title = chapterTitles[i]?.trim() || "";
    if (!backMatterPattern.test(title)) {
      end = i;
      break;
    }
  }

  logInfo(`[EPUB Parser] Detected narrative boundaries: chapters ${start} to ${end} (out of ${chapterTitles.length} total)`);
  if (start > 0) {
    logInfo(`[EPUB Parser] Front matter: ${chapterTitles.slice(0, start).join(", ")}`);
  }
  if (end < chapterTitles.length - 1) {
    logInfo(`[EPUB Parser] Back matter: ${chapterTitles.slice(end + 1).join(", ")}`);
  }

  return { start, end };
};

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const originalWarn = console.warn;
const createWarnFilter = () => {
  const suppressedWarnings: string[] = [];
  console.warn = (msg: any, ...args: unknown[]) => {
    if (typeof msg === "string" && msg.includes("No element with id") && msg.includes("parsing <metadata>")) {
      suppressedWarnings.push(msg);
      return;
    }
    originalWarn(msg, ...args);
  };
  return suppressedWarnings;
};

export const parseEpub = async (epubPath: string, resourceSaveDir?: string): Promise<ParsedBook> => {
  logInfo(`[EPUB Parser] Starting parse for: ${basename(epubPath)}`);

  const suppressedWarnings = createWarnFilter();

  let epubFile: Awaited<ReturnType<typeof initEpubFile>> | null = null;
  try {
    epubFile = await initEpubFile(epubPath, resourceSaveDir);
    await epubFile.loadEpub();
    logInfo(`[EPUB Parser] EPUB loaded successfully`);

    await epubFile.parse();

    if (suppressedWarnings.length > 0) {
      logInfo(`[EPUB Parser] Suppressed ${suppressedWarnings.length} metadata warnings (non-critical)`);
    }
    logInfo(`[EPUB Parser] Parse completed`);

    const fileBaseName = basename(epubPath, ".epub");
    type EpubMetadata = ReturnType<typeof epubFile.getMetadata>;
    let metadata: EpubMetadata | null = null;
    try {
      metadata = epubFile.getMetadata();
    } catch {
      metadata = null;
    }
    const safeMetadata = metadata ?? ({} as EpubMetadata);
    const spine = epubFile.getSpine();
    const toc = epubFile.getToc();

    logInfo(`[EPUB Parser] Found ${spine.length} spine items, ${toc.length} TOC entries`);

    const titleById = new Map<string, string>();
    const walkToc = (items: typeof toc) => {
      items.forEach((item: (typeof toc)[number]) => {
        const resolved = epubFile!.resolveHref(item.href);
        if (resolved?.id) titleById.set(resolved.id, item.label);
        if (item.children?.length) walkToc(item.children);
      });
    };
    walkToc(toc);
    const coverImagePath = epubFile.getCoverImage() || null;

    const chapters: Chapter[] = [];
    const chapterTitles: string[] = [];
    for (const [index, item] of spine.entries()) {
      const chapter = await epubFile.loadChapter(item.id);
      const content = stripHtml(chapter.html);
      if (!content) continue;
      const chapterTitle = titleById.get(item.id) || item.id || `Chapter ${index + 1}`;
      chapters.push({
        title: chapterTitle,
        content,
      });
      chapterTitles.push(chapterTitle);
    }

    const author = safeMetadata.creator?.[0]?.contributor ?? null;

    logInfo(`[EPUB Parser] Extracted ${chapters.length} chapters with content`);
    logInfo(`[EPUB Parser] Title: "${safeMetadata.title || fileBaseName || "Untitled"}", Author: "${author || "Unknown"}"`);

    const { start: narrativeStartIndex, end: narrativeEndIndex } = detectNarrativeBoundaries(chapterTitles);

    return {
      title: safeMetadata.title || fileBaseName || "Untitled",
      author,
      coverImagePath,
      chapters,
      chapterTitles,
      narrativeStartIndex,
      narrativeEndIndex,
    };
  } finally {
    epubFile?.destroy();
    console.warn = originalWarn;
  }
};
