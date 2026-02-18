import { embed, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getBook } from "../db/queries.js";
import { resolveBookId } from "./utils.js";
import { queryBookIndex } from "../services/vector-store.js";
import { ensureDataDirs, getModels, isAskEnabled, requireOpenAIKey } from "../services/constants.js";
import { handleSigint, stdout } from "./io.js";
import { formatContext, renderSources, resolveMaxChapter } from "../shared/utils.js";

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

  const maxChapterIndex = resolveMaxChapter(book, options.maxChapter);

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

  stdout(renderSources(selectedMatches));
};
