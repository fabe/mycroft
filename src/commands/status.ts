import { getBook } from "../db/queries.js";
import { ensureDataDirs, requireOpenAIKey } from "../services/constants.js";
import { resolveBookId } from "./utils.js";
import { stdout } from "./io.js";

export const statusCommand = async (id: string) => {
  await ensureDataDirs();

  const resolvedId = await resolveBookId(id);
  if (!resolvedId) {
    throw new Error(`Book not found: ${id}`);
  }

  const book = await getBook(resolvedId);
  if (!book) {
    throw new Error(`Book not found: ${id}`);
  }

  const shortId = resolvedId.slice(0, 8);

  stdout(`Book: ${book.title}`);
  stdout(`ID:   ${book.id}`);

  if (book.indexedAt) {
    stdout(`\nStatus: completed`);
    stdout(`Chunks: ${book.chunkCount}`);
    stdout(`Indexed: ${new Date(book.indexedAt).toLocaleString()}`);
    return;
  }

  // Summary batch in progress
  if (book.summaryBatchId) {
    requireOpenAIKey();
    const { checkBatchStatus } = await import("../services/batch-embedder.js");
    const status = await checkBatchStatus(book.summaryBatchId);

    stdout(`\nStatus: summary batch ${status.status}`);
    stdout(`Batch:  ${book.summaryBatchId}`);
    stdout(`Progress: ${status.completed}/${status.total} requests${status.failed > 0 ? ` (${status.failed} failed)` : ""}`);

    if (status.status === "completed") {
      if (status.failed > 0 && status.completed === 0) {
        stdout(`\nAll requests failed. Run resume to re-submit.`);
      } else {
        stdout(`\nSummary batch is ready.`);
      }
      stdout(`  mycroft book ingest resume ${shortId}   # process summaries and submit embedding batch`);
    } else if (["failed", "expired", "cancelled"].includes(status.status)) {
      stdout(`\nSummary batch ended with "${status.status}".`);
      stdout(`  mycroft book ingest resume ${shortId}   # re-submit summary batch`);
    } else {
      stdout(`\nSummary batch still processing.`);
      stdout(`  mycroft book ingest status ${shortId}   # check again later`);
      stdout(`  mycroft book ingest resume ${shortId}   # resume when ready`);
    }
    return;
  }

  // Embedding batch in progress
  if (book.batchId) {
    requireOpenAIKey();
    const { checkBatchStatus } = await import("../services/batch-embedder.js");
    const status = await checkBatchStatus(book.batchId);

    stdout(`\nStatus: embedding batch ${status.status}`);
    stdout(`Batch:  ${book.batchId}`);
    stdout(`Progress: ${status.completed}/${status.total} requests${status.failed > 0 ? ` (${status.failed} failed)` : ""}`);

    if (status.status === "completed") {
      if (status.failed > 0 && status.completed === 0) {
        stdout(`\nAll requests failed. Run resume to re-submit.`);
      } else {
        stdout(`\nEmbedding batch is ready.`);
      }
      stdout(`  mycroft book ingest resume ${shortId}   # complete indexing`);
    } else if (["failed", "expired", "cancelled"].includes(status.status)) {
      stdout(`\nEmbedding batch ended with "${status.status}".`);
      stdout(`  mycroft book ingest resume ${shortId}   # re-submit embedding batch`);
    } else {
      stdout(`\nEmbedding batch still processing.`);
      stdout(`  mycroft book ingest status ${shortId}   # check again later`);
      stdout(`  mycroft book ingest resume ${shortId}   # resume when ready`);
    }
    return;
  }

  if (book.ingestResumePath && book.ingestState === "pending") {
    stdout(`\nStatus: interrupted`);
    stdout(`Chunks completed: ${book.chunkCount}`);
    stdout(`  mycroft book ingest resume ${shortId}   # continue ingestion`);
    return;
  }

  stdout(`\nStatus: no active ingestion`);
};
