import OpenAI from "openai";
import type { BookChunk } from "../shared/types.js";
import type { EmbeddedChunk } from "./embedder.js";
import { getModels, logInfo, logWarn } from "./constants.js";

type BatchRequestLine = {
  custom_id: string;
  method: "POST";
  url: "/v1/embeddings";
  body: { model: string; input: string };
};

const buildJsonl = (chunks: BookChunk[], model: string): string =>
  chunks
    .map(
      (chunk, i): BatchRequestLine => ({
        custom_id: String(i),
        method: "POST",
        url: "/v1/embeddings",
        body: { model, input: chunk.content },
      })
    )
    .map((line) => JSON.stringify(line))
    .join("\n");

export type BatchSubmitResult = {
  batchId: string;
  inputFileId: string;
};

export const submitBatchEmbeddings = async (chunks: BookChunk[]): Promise<BatchSubmitResult> => {
  const models = await getModels();
  const client = new OpenAI();

  logInfo(`[BatchEmbedder] Preparing batch request for ${chunks.length} chunks`);

  const jsonl = buildJsonl(chunks, models.embedding);
  const blob = new Blob([jsonl], { type: "application/jsonl" });
  const file = await client.files.create({
    file: new File([blob], "embeddings.jsonl", { type: "application/jsonl" }),
    purpose: "batch",
  });
  logInfo(`[BatchEmbedder] Uploaded input file ${file.id}`);

  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/embeddings",
    completion_window: "24h",
  });
  logInfo(`[BatchEmbedder] Created batch ${batch.id} — status: ${batch.status}`);

  return { batchId: batch.id, inputFileId: file.id };
};

export type BatchStatus = {
  status: string;
  completed: number;
  failed: number;
  total: number;
  outputFileId: string | null;
  errorFileId: string | null;
};

export const checkBatchStatus = async (batchId: string): Promise<BatchStatus> => {
  const client = new OpenAI();
  const batch = await client.batches.retrieve(batchId);
  return {
    status: batch.status,
    completed: batch.request_counts?.completed ?? 0,
    failed: batch.request_counts?.failed ?? 0,
    total: batch.request_counts?.total ?? 0,
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
  };
};

export const downloadBatchResults = async (
  outputFileId: string,
  chunks: BookChunk[],
): Promise<EmbeddedChunk[]> => {
  const client = new OpenAI();

  logInfo(`[BatchEmbedder] Downloading results from ${outputFileId}`);
  const response = await client.files.content(outputFileId);
  const text = await response.text();
  const lines = text.trim().split("\n");

  const vectors = new Map<number, number[]>();
  for (const line of lines) {
    const result = JSON.parse(line);
    const idx = Number(result.custom_id);
    if (result.response?.status_code === 200) {
      const embedding = result.response.body?.data?.[0]?.embedding;
      if (embedding) {
        vectors.set(idx, embedding);
      }
    } else {
      logWarn(
        `[BatchEmbedder] Request ${idx} failed: ${JSON.stringify(result.response?.body?.error ?? result.error)}`
      );
    }
  }

  const embedded: EmbeddedChunk[] = chunks.map((chunk, i) => ({
    ...chunk,
    vector: vectors.get(i) ?? [],
  }));

  const missing = embedded.filter((e) => e.vector.length === 0).length;
  if (missing > 0) {
    logWarn(`[BatchEmbedder] ${missing} chunk(s) have empty embeddings due to batch errors`);
  }

  logInfo(`[BatchEmbedder] Successfully processed ${embedded.length} chunks via batch API`);
  return embedded;
};

export const cleanupBatchFiles = async (inputFileId: string, outputFileId?: string | null) => {
  const client = new OpenAI();
  await client.files.del(inputFileId).catch(() => undefined);
  if (outputFileId) {
    await client.files.del(outputFileId).catch(() => undefined);
  }
};
