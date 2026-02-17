import { embed, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getBook } from "../db/queries";
import { resolveBookId } from "./utils";
import { queryBookIndex } from "../services/vector-store";
import { ensureDataDirs, getModels, isAskEnabled, requireOpenAIKey } from "../services/constants";
import { handleSigint } from "./io";

const formatContext = (chunks: Array<{ content: string; chapterTitle: string; chapterIndex: number }>) =>
  chunks
    .map(
      (chunk, index) =>
        `Excerpt [${index + 1}] (${chunk.chapterTitle || `Chapter ${chunk.chapterIndex + 1}`}):\n${chunk.content}`
    )
    .join("\n\n");

export const askCommand = async (
  id: string,
  question: string,
  options: { topK: number; maxChapter?: number }
) => {
  if (!(await isAskEnabled())) {
    throw new Error("Ask is disabled in config (askEnabled: false). Enable it to use this command.");
  }

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
    value: question,
  });

  const narrativeStart = book.narrativeStartIndex ?? 0;
  const userProgress = book.progressChapter ?? null;
  const maxChapterIndex = options.maxChapter !== undefined
    ? narrativeStart + options.maxChapter
    : userProgress !== null
      ? narrativeStart + userProgress
      : undefined;

  const retrievalLimit = options.topK * 3;
  const allMatches = await queryBookIndex(resolvedId, embedding, question, retrievalLimit, maxChapterIndex);

  const summaries = allMatches.filter((m) => m.type === "summary");
  const chunks = allMatches.filter((m) => m.type !== "summary");

  const topSummaries = summaries.slice(0, 2);
  const topChunks = chunks.slice(0, Math.max(0, options.topK - topSummaries.length));
  const selectedMatches = [...topSummaries, ...topChunks];

  const context = formatContext(selectedMatches);

  const releaseSigint = handleSigint();
  const stream = streamText({
    model: openai(models.chat),
    system: `You are a reading companion helping readers understand this book.

Guidelines:
- Use the provided chapter summaries and excerpts to answer questions
- Chapter summaries provide high-level context about characters, events, and plot
- Excerpts provide specific details and quotes
- When asked for recaps or "what happened", synthesize from summaries
- Don't cite table of contents, front matter, or structural elements
- If truly unsure, briefly say so - but try to answer from available context first
- Cite sources using [1], [2], etc. at the end of relevant sentences
- The context may be limited to earlier chapters only - don't infer beyond what's provided`,
    prompt: `Question: ${question}\n\n${context}`,
  });

  try {
    for await (const part of stream.textStream) {
      process.stdout.write(part);
    }
  } finally {
    releaseSigint();
  }

  if (selectedMatches.length > 0) {
    process.stdout.write("\n\nSources:\n");
    selectedMatches.forEach((match, index) => {
      const title = match.chapterTitle || `Chapter ${match.chapterIndex + 1}`;
      const excerpt = match.content.slice(0, 120).replace(/\s+/g, " ");
      process.stdout.write(`[${index + 1}] ${title}: ${excerpt}\n`);
    });
  }
};
