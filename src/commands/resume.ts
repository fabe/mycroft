import { getBook, getBookBatchChunks, getBookSummaryBatchChapters } from "../db/queries.js";
import { resumeIngest, resumeLocalIngest, resumeSummaryBatch, resumeMergeBatch } from "../services/ingest.js";
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

  const shortId = resolvedId.slice(0, 8);

  // Phase 1: Summary batch pending
  if (book.summaryBatchId) {
    const rawData = await getBookSummaryBatchChapters(resolvedId);
    if (!rawData) {
      throw new Error(`No stored summary batch data for book "${book.title}". Re-ingest with "mycroft book ingest --batch --summary".`);
    }

    let storedData: any;
    try {
      storedData = JSON.parse(rawData);
    } catch {
      throw new Error(`Corrupt summary batch data for book "${book.title}". Re-ingest with "mycroft book ingest --batch --summary".`);
    }

    let result;
    if (storedData.isMergePass) {
      result = await resumeMergeBatch(resolvedId, book.summaryBatchId, book.summaryBatchFileId ?? book.summaryBatchId, storedData);
    } else {
      result = await resumeSummaryBatch(resolvedId, book.summaryBatchId, book.summaryBatchFileId ?? book.summaryBatchId, storedData);
    }

    if (result.status === "embeddings_submitted") {
      stdout(`\nSummaries complete. Embedding batch submitted (${result.batchId}).`);
      stdout(`  mycroft book ingest status ${shortId}   # check embedding batch progress`);
      stdout(`  mycroft book ingest resume ${shortId}   # complete ingestion once batch finishes`);
    } else if (result.status === "merge_submitted") {
      stdout(`\nSection summaries complete. Merge batch submitted (${result.batchId}).`);
      stdout(`  mycroft book ingest status ${shortId}   # check merge batch progress`);
      stdout(`  mycroft book ingest resume ${shortId}   # continue when batch finishes`);
    } else if (result.status === "resubmitted") {
      stdout(`\nSummary batch failed and was re-submitted (${result.batchId}).`);
      stdout(`  mycroft book ingest status ${shortId}   # check batch progress`);
      stdout(`  mycroft book ingest resume ${shortId}   # continue when batch finishes`);
    } else {
      stdout(`\nSummary batch still in progress (${result.status}: ${result.completed}/${result.total}).`);
      stdout(`  mycroft book ingest status ${shortId}   # check batch progress`);
      stdout(`  mycroft book ingest resume ${shortId}   # retry when batch finishes`);
    }
    return;
  }

  // Phase 2: Embedding batch pending
  if (book.batchId) {
    const rawChunks = await getBookBatchChunks(resolvedId);
    if (!rawChunks) {
      throw new Error(`No stored chunks found for book "${book.title}". Re-ingest with "mycroft book ingest --batch".`);
    }

    let chunks: BookChunk[];
    try {
      chunks = JSON.parse(rawChunks);
    } catch {
      throw new Error(`Corrupt chunk data for book "${book.title}". Re-ingest with "mycroft book ingest --batch".`);
    }
    const result = await resumeIngest(resolvedId, chunks, book.batchId, book.batchFileId ?? book.batchId);

    if (result.status === "completed") {
      stdout(`\nDone. Book "${book.title}" indexed as ${book.id}`);
    } else if (result.status === "resubmitted") {
      stdout(`\nBatch failed and was re-submitted (${result.batchId}).`);
      stdout(`  mycroft book ingest status ${shortId}   # check batch progress`);
      stdout(`  mycroft book ingest resume ${shortId}   # complete ingestion once batch finishes`);
    } else {
      stdout(`\nBatch still in progress (${result.status}: ${result.completed}/${result.total}).`);
      stdout(`  mycroft book ingest status ${shortId}   # check batch progress`);
      stdout(`  mycroft book ingest resume ${shortId}   # retry when batch finishes`);
    }
    return;
  }

  // Phase 3: Local resume (non-batch interrupted ingest)
  if (!book.ingestResumePath || book.ingestState !== "pending") {
    throw new Error(`Book "${book.title}" has no resumable ingest. Re-ingest to start one.`);
  }

  const result = await resumeLocalIngest(resolvedId, book.ingestResumePath, book.chunkCount ?? 0);
  if (result.status === "completed") {
    stdout(`\nDone. Book "${book.title}" indexed as ${book.id}`);
  }
};
