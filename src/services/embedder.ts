import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import type { BookChunk } from "../shared/types.js";
import { getModels, logInfo, logWarn } from "./constants.js";

export type EmbeddedChunk = BookChunk & {
  vector: number[];
};

const MAX_TOKENS_PER_BATCH = 250_000;
const CHARS_PER_TOKEN = 4;

type EmbedProgress = {
  batchIndex: number;
  batchCount: number;
  completed: number;
  total: number;
};

export const embedChunks = async (
  chunks: BookChunk[],
  options?: { onBatch?: (embedded: EmbeddedChunk[], progress: EmbedProgress) => Promise<void> | void }
): Promise<EmbeddedChunk[]> => {
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

    const embeddedBatch: EmbeddedChunk[] = [];
    for (let j = 0; j < batch.length; j++) {
      const vector = embeddings[j] ?? [];
      if (vector.length === 0) {
        logWarn(`[Embedder] Chunk ${allEmbedded.length + j} has empty embedding`);
      }
      const embeddedChunk = {
        ...batch[j]!,
        vector,
      };
      embeddedBatch.push(embeddedChunk);
      allEmbedded.push({
        ...embeddedChunk,
      });
    }

    if (options?.onBatch) {
      await options.onBatch(embeddedBatch, {
        batchIndex: i + 1,
        batchCount: batches.length,
        completed: allEmbedded.length,
        total: chunks.length,
      });
    }
  }

  logInfo(`[Embedder] Successfully embedded all ${allEmbedded.length} chunks`);

  return allEmbedded;
};
