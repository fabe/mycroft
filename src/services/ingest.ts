import { randomUUID } from "node:crypto";
import { mkdir, unlink, copyFile } from "node:fs/promises";
import { parseEpub } from "./epub-parser.js";
import { chunkChapters } from "./chunker.js";
import { embedChunks } from "./embedder.js";
import { submitBatchEmbeddings } from "./batch-embedder.js";
import { addChunksToIndex, deleteBookIndex } from "./vector-store.js";
import { summarizeAllChapters } from "./summarizer.js";
import { ensureDataDirs, logInfo, logWarn } from "./constants.js";
import { deleteBook, insertBook, updateBook } from "../db/queries.js";
import type { BookChunk } from "../shared/types.js";

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds}s`;
};

export const ingestEpub = async (
  filePath: string,
  selectedChapterIndices?: number[],
  options?: { summarize?: boolean; batch?: boolean }
) => {
  const bookId = randomUUID();
  const paths = await ensureDataDirs();
  const fileName = `${bookId}.epub`;
  const bookPath = `${paths.booksDir}/${fileName}`;

  logInfo(`[Ingest] Starting ingestion for book ${bookId}`);

  await mkdir(paths.booksDir, { recursive: true });
  await copyFile(filePath, bookPath);
  logInfo(`[Ingest] EPUB file saved to ${bookPath}`);

  const parseStart = Date.now();
  const parsed = await parseEpub(bookPath);
  logInfo(`[Ingest] Parsed "${parsed.title}" with ${parsed.chapters.length} chapters (${formatDuration(Date.now() - parseStart)})`);
  logInfo(`[Ingest] Narrative chapters: ${parsed.narrativeStartIndex} to ${parsed.narrativeEndIndex}`);

  await insertBook({
    id: bookId,
    title: parsed.title,
    author: parsed.author,
    coverPath: parsed.coverImagePath,
    epubPath: bookPath,
    chapters: parsed.chapterTitles,
    narrativeStartIndex: parsed.narrativeStartIndex,
    narrativeEndIndex: parsed.narrativeEndIndex,
  });
  logInfo(`[Ingest] Book record inserted into database`);

  try {
    const chaptersToProcess = selectedChapterIndices
      ? parsed.chapters.filter((_, index) => selectedChapterIndices.includes(index))
      : parsed.chapters.slice(parsed.narrativeStartIndex, parsed.narrativeEndIndex + 1);

    const selectedIndices = selectedChapterIndices ||
      Array.from({ length: parsed.narrativeEndIndex - parsed.narrativeStartIndex + 1 },
        (_, i) => i + parsed.narrativeStartIndex);

    logInfo(`[Ingest] Processing ${chaptersToProcess.length} selected chapters (indices: ${selectedIndices.join(", ")})`);

    let adjustedSummaries: BookChunk[] = [];
    if (options?.summarize !== false) {
      logInfo(`[Ingest] Generating summaries for ${chaptersToProcess.length} chapters...`);
      const summarizeStart = Date.now();
      const summaries = await summarizeAllChapters(chaptersToProcess);
      logInfo(`[Ingest] Generated ${summaries.length}/${chaptersToProcess.length} summaries (${formatDuration(Date.now() - summarizeStart)})`);

      const summaryRecords = summaries.map((s, idx) => ({
        ...s,
        chapterIndex: selectedIndices[idx] ?? s.chapterIndex,
      }));

      await updateBook(bookId, {
        summaries: JSON.stringify(summaryRecords),
      });

      adjustedSummaries = summaryRecords.map((s) => ({
        id: `${bookId}-summary-${s.chapterIndex}`,
        bookId,
        chapterIndex: s.chapterIndex,
        chapterTitle: s.chapterTitle,
        chunkIndex: -1,
        content: s.fullSummary,
        type: "summary" as const,
      }));
      logInfo(`[Ingest] Created ${adjustedSummaries.length} summary chunks`);
    }

    const chunksToProcess = parsed.chapters.map((chapter, index) =>
      selectedIndices.includes(index) ? chapter : { title: chapter.title, content: "" }
    );
    const chunks = chunkChapters(bookId, chunksToProcess).filter((chunk) => chunk.content.length > 0);
    logInfo(`[Ingest] Created ${chunks.length} chunks from selected chapters`);

    const allChunks = [...chunks, ...adjustedSummaries];

    if (options?.batch) {
      logInfo(`[Ingest] Submitting ${allChunks.length} chunks to OpenAI Batch API`);
      const { batchId, inputFileId } = await submitBatchEmbeddings(allChunks);
      await updateBook(bookId, {
        batchId,
        batchFileId: inputFileId,
        batchChunks: JSON.stringify(allChunks),
      });
      logInfo(`[Ingest] Batch submitted (${batchId}). Run "mycroft book resume ${bookId.slice(0, 8)}" to complete ingestion.`);
    } else {
      const embedStart = Date.now();
      const embedded = await embedChunks(allChunks);
      logInfo(`[Ingest] Embedded ${embedded.length} total chunks (${formatDuration(Date.now() - embedStart)})`);

      await addChunksToIndex(bookId, embedded);
      logInfo(`[Ingest] Added chunks to vector index`);

      await updateBook(bookId, { chunkCount: embedded.length, indexedAt: Date.now() });
      logInfo(`[Ingest] Updated book record with chunk count: ${embedded.length}`);
    }
  } catch (error) {
    logWarn(`[Ingest] Error during chunking/embedding: ${error instanceof Error ? error.message : String(error)}`);
    await deleteBookIndex(bookId);
    await unlink(bookPath).catch(() => undefined);
    await deleteBook(bookId).catch(() => undefined);
    throw error;
  }

  logInfo(`[Ingest] Ingestion complete for ${bookId}`);
  return { id: bookId };
};

export const resumeIngest = async (bookId: string, storedChunks: BookChunk[], batchId: string, batchFileId: string) => {
  const { checkBatchStatus, downloadBatchResults, cleanupBatchFiles } = await import("./batch-embedder.js");

  logInfo(`[Resume] Checking batch ${batchId} for book ${bookId}`);
  const status = await checkBatchStatus(batchId);

  logInfo(`[Resume] Batch status: ${status.status} (completed: ${status.completed}/${status.total})`);

  if (["validating", "in_progress", "finalizing"].includes(status.status)) {
    return { status: status.status as "validating" | "in_progress" | "finalizing", completed: status.completed, total: status.total };
  }

  if (status.status === "failed" || status.status === "expired" || status.status === "cancelled") {
    logWarn(`[Resume] Batch ${batchId} ended with status "${status.status}". Re-submitting...`);
    await cleanupBatchFiles(batchFileId, status.outputFileId);

    const { submitBatchEmbeddings } = await import("./batch-embedder.js");
    const { batchId: newBatchId, inputFileId: newFileId } = await submitBatchEmbeddings(storedChunks);

    await updateBook(bookId, { batchId: newBatchId, batchFileId: newFileId });
    logInfo(`[Resume] New batch submitted (${newBatchId}). Run resume again later.`);
    return { status: "resubmitted" as const, batchId: newBatchId };
  }

  if (status.status !== "completed" || !status.outputFileId) {
    throw new Error(`Unexpected batch status: ${status.status}`);
  }

  const embedded = await downloadBatchResults(status.outputFileId, storedChunks);

  await addChunksToIndex(bookId, embedded);
  logInfo(`[Resume] Added ${embedded.length} chunks to vector index`);

  await updateBook(bookId, {
    chunkCount: embedded.length,
    indexedAt: Date.now(),
    batchId: null,
    batchFileId: null,
    batchChunks: null,
  });
  logInfo(`[Resume] Book ${bookId} indexing complete`);

  await cleanupBatchFiles(batchFileId, status.outputFileId);

  return { status: "completed" as const };
};
