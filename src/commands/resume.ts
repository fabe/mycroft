import { getBook, getBookBatchChunks } from "../db/queries.js";
import { resumeIngest } from "../services/ingest.js";
import { ensureDataDirs, requireOpenAIKey } from "../services/constants.js";
import { resolveBookId } from "./utils.js";
import { stdout } from "./io.js";
import type { BookChunk } from "../shared/types.js";

export const resumeCommand = async (id: string) => {
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

  if (book.indexedAt) {
    stdout(`Book "${book.title}" is already indexed (${book.chunkCount} chunks).`);
    return;
  }

  if (!book.batchId) {
    throw new Error(`Book "${book.title}" has no pending batch. Re-ingest with "mycroft book ingest --batch" to start one.`);
  }

  const rawChunks = await getBookBatchChunks(resolvedId);
  if (!rawChunks) {
    throw new Error(`No stored chunks found for book "${book.title}". Re-ingest with "mycroft book ingest --batch".`);
  }

  const chunks: BookChunk[] = JSON.parse(rawChunks);
  const result = await resumeIngest(resolvedId, chunks, book.batchId, book.batchFileId ?? book.batchId);

  if (result.status === "completed") {
    stdout(`\nDone. Book "${book.title}" indexed as ${book.id}`);
  } else if (result.status === "resubmitted") {
    stdout(`\nBatch failed and was re-submitted (${result.batchId}). Run resume again later.`);
  } else {
    stdout(`\nBatch still in progress (${result.status}: ${result.completed}/${result.total}). Run resume again later.`);
  }
};
