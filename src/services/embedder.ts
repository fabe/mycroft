import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import type { BookChunk } from "../shared/types";
import { getModels, logInfo } from "./constants";

export type EmbeddedChunk = BookChunk & {
  vector: number[];
};

const MAX_TOKENS_PER_BATCH = 250_000;
const CHARS_PER_TOKEN = 4;

export const embedChunks = async (chunks: BookChunk[]): Promise<EmbeddedChunk[]> => {
  if (chunks.length === 0) return [];

  const batches: BookChunk[][] = [];
  let currentBatch: BookChunk[] = [];
  let currentTokens = 0;

  for (const chunk of chunks) {
    const estimatedTokens = Math.ceil(chunk.content.length / CHARS_PER_TOKEN);

    if (currentTokens + estimatedTokens > MAX_TOKENS_PER_BATCH && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }

    currentBatch.push(chunk);
    currentTokens += estimatedTokens;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  logInfo(`[Embedder] Processing ${chunks.length} chunks in ${batches.length} batch(es)`);

  const allEmbedded: EmbeddedChunk[] = [];
  const models = await getModels();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const estimatedTokens = batch.reduce((sum, c) => sum + Math.ceil(c.content.length / CHARS_PER_TOKEN), 0);

    logInfo(`[Embedder] Batch ${i + 1}/${batches.length}: ${batch.length} chunks (~${estimatedTokens.toLocaleString()} tokens)`);

    const { embeddings } = await embedMany({
      model: openai.embeddingModel(models.embedding),
      values: batch.map((chunk) => chunk.content),
    });

    for (let j = 0; j < batch.length; j++) {
      allEmbedded.push({
        ...batch[j]!,
        vector: embeddings[j] ?? [],
      });
    }
  }

  logInfo(`[Embedder] Successfully embedded all ${allEmbedded.length} chunks`);

  return allEmbedded;
};
