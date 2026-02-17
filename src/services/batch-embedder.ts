import OpenAI from "openai";
import type { BookChunk } from "../shared/types.js";
import type { EmbeddedChunk } from "./embedder.js";
import { getModels, logInfo, logWarn } from "./constants.js";

const POLL_INTERVAL_MS = 10_000;

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

export const embedChunksBatch = async (chunks: BookChunk[]): Promise<EmbeddedChunk[]> => {
  if (chunks.length === 0) return [];

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

  let current = batch;
  while (!["completed", "failed", "expired", "cancelled"].includes(current.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await client.batches.retrieve(batch.id);
    const counts = current.request_counts;
    logInfo(
      `[BatchEmbedder] Status: ${current.status} (completed: ${counts?.completed ?? 0}/${counts?.total ?? 0})`
    );
  }

  if (current.status !== "completed") {
    const errMsg = current.errors?.data?.map((e) => e.message).join("; ") ?? "unknown error";
    throw new Error(`Batch ${batch.id} ended with status "${current.status}": ${errMsg}`);
  }

  if (!current.output_file_id) {
    throw new Error(`Batch ${batch.id} completed but has no output file`);
  }

  logInfo(`[BatchEmbedder] Downloading results from ${current.output_file_id}`);
  const response = await client.files.content(current.output_file_id);
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

  // Clean up uploaded files
  await client.files.del(file.id).catch(() => undefined);
  if (current.output_file_id) {
    await client.files.del(current.output_file_id).catch(() => undefined);
  }

  return embedded;
};
