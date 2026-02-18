import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { getBook } from "../db/queries.js";
import { resolveBookId } from "./utils.js";
import { queryBookIndex } from "../services/vector-store.js";
import { ensureDataDirs, getModels, requireOpenAIKey } from "../services/constants.js";
import { stdout } from "./io.js";
import { resolveMaxChapter } from "../shared/utils.js";

export const searchCommand = async (
  id: string,
  query: string,
  options: { topK: number; maxChapter?: number }
) => {
  requireOpenAIKey();
  await ensureDataDirs();
  const resolvedId = await resolveBookId(id);
  if (!resolvedId) {
    throw new Error(`Book not found: ${id}`);
  }
  const book = await getBook(resolvedId);
  if (!book) {
    throw new Error(`Book not found: ${id}`);
  }

  const models = await getModels();
  const { embedding } = await embed({
    model: openai.embeddingModel(models.embedding),
    value: query,
  });

  const maxChapterIndex = resolveMaxChapter(book, options.maxChapter);
  const results = await queryBookIndex(resolvedId, embedding, query, options.topK, maxChapterIndex);

  if (results.length === 0) {
    stdout("No results.");
    return;
  }

  results.forEach((result, index) => {
    const chapterTitle = result.chapterTitle || `Chapter ${result.chapterIndex + 1}`;
    const excerpt = result.content.slice(0, 200).replace(/\s+/g, " ");
    stdout(`\n#${index + 1} score=${result.score.toFixed(4)} type=${result.type || "chunk"}`);
    stdout(`${chapterTitle} (chapter ${result.chapterIndex})`);
    stdout(excerpt);
  });
};
