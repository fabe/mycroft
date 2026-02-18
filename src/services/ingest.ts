import { randomUUID } from "node:crypto";
import { mkdir, unlink, copyFile, readFile, writeFile } from "node:fs/promises";
import { parseEpub } from "./epub-parser.js";
import { chunkChapters } from "./chunker.js";
import { embedChunks } from "./embedder.js";
import { submitBatchEmbeddings } from "./batch-embedder.js";
import { submitBatchSummaries } from "./batch-summarizer.js";
import { addChunksToIndex, deleteBookIndex } from "./vector-store.js";
import { summarizeAllChapters } from "./summarizer.js";
import { ensureDataDirs, logInfo, logWarn } from "./constants.js";
import { deleteBook, insertBook, updateBook } from "../db/queries.js";
import type { BookChunk, Chapter } from "../shared/types.js";
import type { EmbeddedChunk } from "./embedder.js";

type ResumeState = {
  chunks: BookChunk[];
  resumeIndex: number;
};

const resumePathForBook = async (bookId: string) => {
  const paths = await ensureDataDirs();
  return `${paths.ingestDir}/${bookId}.json`;
};

const loadResumeState = async (bookId: string, resumePath: string): Promise<ResumeState> => {
  const raw = await readFile(resumePath, "utf-8");
  const parsed = JSON.parse(raw) as ResumeState;
  if (!Array.isArray(parsed.chunks) || typeof parsed.resumeIndex !== "number") {
    throw new Error(`Invalid resume state for book ${bookId}. Re-ingest to start over.`);
  }
  return parsed;
};

const persistResumeState = async (bookId: string, state: ResumeState) => {
  const resumePath = await resumePathForBook(bookId);
  await writeFile(resumePath, JSON.stringify(state));
  await updateBook(bookId, {
    ingestState: "pending",
    ingestResumePath: resumePath,
  });
  return resumePath;
};

const finalizeResumeState = async (bookId: string, resumePath?: string | null) => {
  const path = resumePath || (await resumePathForBook(bookId));
  await unlink(path).catch(() => undefined);
  await updateBook(bookId, { ingestState: null, ingestResumePath: null });
};

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
  let resumePath: string | null = null;

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
    if (options?.summarize !== false && !options?.batch) {
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

    if (options?.batch) {
      if (options?.summarize !== false) {
        // Batch mode with summaries: submit summary batch first, embedding batch later on resume
        logInfo(`[Ingest] Submitting ${chaptersToProcess.length} chapters for batch summarization`);
        const { batchId: summaryBatchId, inputFileId: summaryFileId, metadata } = await submitBatchSummaries(chaptersToProcess);
        await updateBook(bookId, {
          summaryBatchId,
          summaryBatchFileId: summaryFileId,
          summaryBatchChapters: JSON.stringify({ chapters: chaptersToProcess, metadata, selectedIndices, textChunks: chunks }),
        });
        logInfo(`[Ingest] Summary batch submitted (${summaryBatchId}). Use "mycroft book ingest status ${bookId.slice(0, 8)}" or "mycroft book ingest resume ${bookId.slice(0, 8)}".`);
      } else {
        // Batch mode without summaries: submit embedding batch directly
        logInfo(`[Ingest] Submitting ${chunks.length} chunks to OpenAI Batch API`);
        const { batchId, inputFileId } = await submitBatchEmbeddings(chunks);
        await updateBook(bookId, {
          batchId,
          batchFileId: inputFileId,
          batchChunks: JSON.stringify(chunks),
        });
        logInfo(`[Ingest] Batch submitted (${batchId}). Use "mycroft book ingest status ${bookId.slice(0, 8)}" or "mycroft book ingest resume ${bookId.slice(0, 8)}".`);
      }
    } else {
      const allChunks = [...chunks, ...adjustedSummaries];
      const embedStart = Date.now();
      resumePath = await persistResumeState(bookId, { chunks: allChunks, resumeIndex: 0 });
      const embedded = await embedChunks(allChunks, {
        onBatch: async (embeddedBatch, progress) => {
          await addChunksToIndex(bookId, embeddedBatch);
          await updateBook(bookId, { chunkCount: progress.completed });
          if (!resumePath) return;
          await writeFile(
            resumePath,
            JSON.stringify({ chunks: allChunks, resumeIndex: progress.completed })
          );
        },
      });
      logInfo(`[Ingest] Embedded ${embedded.length} total chunks (${formatDuration(Date.now() - embedStart)})`);

      await updateBook(bookId, { chunkCount: embedded.length, indexedAt: Date.now() });
      logInfo(`[Ingest] Updated book record with chunk count: ${embedded.length}`);
      await finalizeResumeState(bookId, resumePath);
    }
  } catch (error) {
    logWarn(`[Ingest] Error during chunking/embedding: ${error instanceof Error ? error.message : String(error)}`);
    if (resumePath) {
      logWarn(`[Ingest] Partial progress saved. Use "mycroft book ingest status ${bookId.slice(0, 8)}" or "mycroft book ingest resume ${bookId.slice(0, 8)}".`);
      return { id: bookId, status: "interrupted" as const };
    } else {
      await deleteBookIndex(bookId);
      await unlink(bookPath).catch(() => undefined);
      await deleteBook(bookId).catch(() => undefined);
    }
    throw error;
  }

  logInfo(`[Ingest] Ingestion complete for ${bookId}`);
  return { id: bookId, status: "completed" as const };
};

export const resumeIngest = async (bookId: string, storedChunks: BookChunk[], batchId: string, batchFileId: string) => {
  const { checkBatchStatus, downloadBatchResults, cleanupBatchFiles } = await import("./batch-embedder.js");

  logInfo(`[Resume] Checking embedding batch ${batchId} for book ${bookId}`);
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

  if (status.status !== "completed") {
    throw new Error(`Unexpected batch status: ${status.status}`);
  }

  // Batch completed but all requests failed — no output file
  if (!status.outputFileId) {
    logWarn(`[Resume] Batch ${batchId} completed but produced no output (${status.failed}/${status.total} failed). Re-submitting...`);
    await cleanupBatchFiles(batchFileId, null);

    const { submitBatchEmbeddings } = await import("./batch-embedder.js");
    const { batchId: newBatchId, inputFileId: newFileId } = await submitBatchEmbeddings(storedChunks);

    await updateBook(bookId, { batchId: newBatchId, batchFileId: newFileId });
    logInfo(`[Resume] New batch submitted (${newBatchId}). Run resume again later.`);
    return { status: "resubmitted" as const, batchId: newBatchId };
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

export const resumeSummaryBatch = async (
  bookId: string,
  summaryBatchId: string,
  summaryBatchFileId: string,
  storedData: { chapters: Chapter[]; metadata: import("./batch-summarizer.js").SummaryBatchChapter[]; selectedIndices: number[]; textChunks: BookChunk[] },
) => {
  const { checkBatchStatus, cleanupBatchFiles } = await import("./batch-embedder.js");
  const { downloadBatchSummaryResults, submitMergePass, downloadMergeResults } = await import("./batch-summarizer.js");

  logInfo(`[Resume] Checking summary batch ${summaryBatchId} for book ${bookId}`);
  const status = await checkBatchStatus(summaryBatchId);

  logInfo(`[Resume] Summary batch status: ${status.status} (completed: ${status.completed}/${status.total})`);

  if (["validating", "in_progress", "finalizing"].includes(status.status)) {
    return { status: status.status as "validating" | "in_progress" | "finalizing", completed: status.completed, total: status.total, phase: "summary" as const };
  }

  if (status.status === "failed" || status.status === "expired" || status.status === "cancelled") {
    logWarn(`[Resume] Summary batch ${summaryBatchId} ended with status "${status.status}". Re-submitting...`);
    await cleanupBatchFiles(summaryBatchFileId, status.outputFileId);

    const { submitBatchSummaries } = await import("./batch-summarizer.js");
    const { batchId: newBatchId, inputFileId: newFileId, metadata: newMetadata } = await submitBatchSummaries(storedData.chapters);

    await updateBook(bookId, {
      summaryBatchId: newBatchId,
      summaryBatchFileId: newFileId,
      summaryBatchChapters: JSON.stringify({ ...storedData, metadata: newMetadata }),
    });
    logInfo(`[Resume] New summary batch submitted (${newBatchId}).`);
    return { status: "resubmitted" as const, batchId: newBatchId, phase: "summary" as const };
  }

  if (status.status !== "completed") {
    throw new Error(`Unexpected summary batch status: ${status.status}`);
  }

  // Batch completed but all requests failed — no output file
  if (!status.outputFileId) {
    logWarn(`[Resume] Summary batch ${summaryBatchId} completed but produced no output (${status.failed}/${status.total} failed). Re-submitting...`);
    await cleanupBatchFiles(summaryBatchFileId, null);

    const { submitBatchSummaries } = await import("./batch-summarizer.js");
    const { batchId: newBatchId, inputFileId: newFileId, metadata: newMetadata } = await submitBatchSummaries(storedData.chapters);

    await updateBook(bookId, {
      summaryBatchId: newBatchId,
      summaryBatchFileId: newFileId,
      summaryBatchChapters: JSON.stringify({ ...storedData, metadata: newMetadata }),
    });
    logInfo(`[Resume] New summary batch submitted (${newBatchId}).`);
    return { status: "resubmitted" as const, batchId: newBatchId, phase: "summary" as const };
  }

  // Download summary results
  let { summaries, needsMergePass } = await downloadBatchSummaryResults(
    status.outputFileId,
    storedData.chapters,
    storedData.metadata,
  );
  await cleanupBatchFiles(summaryBatchFileId, status.outputFileId);

  // Handle two-pass chapters that need a merge
  if (needsMergePass.length > 0) {
    logInfo(`[Resume] ${needsMergePass.length} chapters need merge pass, submitting merge batch...`);
    const mergeResult = await submitMergePass(needsMergePass);

    // Store merge batch and wait for next resume
    await updateBook(bookId, {
      summaryBatchId: mergeResult.batchId,
      summaryBatchFileId: mergeResult.inputFileId,
      summaryBatchChapters: JSON.stringify({
        ...storedData,
        metadata: mergeResult.metadata,
        completedSummaries: summaries,
        isMergePass: true,
      }),
    });

    return { status: "merge_submitted" as const, batchId: mergeResult.batchId, phase: "summary" as const };
  }

  // All summaries are ready — build summary chunks and submit embedding batch
  return await finalizeSummariesAndSubmitEmbeddings(bookId, summaries, storedData);
};

export const resumeMergeBatch = async (
  bookId: string,
  summaryBatchId: string,
  summaryBatchFileId: string,
  storedData: {
    chapters: Chapter[];
    metadata: import("./batch-summarizer.js").SummaryBatchChapter[];
    selectedIndices: number[];
    textChunks: BookChunk[];
    completedSummaries: import("../shared/types.js").ChapterSummary[];
    isMergePass: true;
  },
) => {
  const { checkBatchStatus, cleanupBatchFiles } = await import("./batch-embedder.js");
  const { downloadMergeResults } = await import("./batch-summarizer.js");

  logInfo(`[Resume] Checking merge batch ${summaryBatchId} for book ${bookId}`);
  const status = await checkBatchStatus(summaryBatchId);

  logInfo(`[Resume] Merge batch status: ${status.status} (completed: ${status.completed}/${status.total})`);

  if (["validating", "in_progress", "finalizing"].includes(status.status)) {
    return { status: status.status as "validating" | "in_progress" | "finalizing", completed: status.completed, total: status.total, phase: "summary" as const };
  }

  if (status.status !== "completed") {
    throw new Error(`Unexpected merge batch status: ${status.status}`);
  }

  if (!status.outputFileId) {
    throw new Error(`Merge batch completed but produced no output (${status.failed}/${status.total} failed). Re-ingest to start over.`);
  }

  const mergedSummaries = await downloadMergeResults(
    status.outputFileId,
    storedData.metadata.map((m) => ({ chapterIndex: m.chapterIndex, title: m.title })),
  );
  await cleanupBatchFiles(summaryBatchFileId, status.outputFileId);

  // Combine previously completed single-pass summaries with the merged two-pass summaries
  const allSummaries = [...(storedData.completedSummaries || []), ...mergedSummaries];

  return await finalizeSummariesAndSubmitEmbeddings(bookId, allSummaries, storedData);
};

const finalizeSummariesAndSubmitEmbeddings = async (
  bookId: string,
  summaries: import("../shared/types.js").ChapterSummary[],
  storedData: { selectedIndices: number[]; textChunks: BookChunk[] },
) => {
  const { submitBatchEmbeddings } = await import("./batch-embedder.js");

  // Adjust chapter indices and store summaries
  const summaryRecords = summaries.map((s) => ({
    ...s,
    chapterIndex: storedData.selectedIndices[s.chapterIndex] ?? s.chapterIndex,
  }));

  await updateBook(bookId, {
    summaries: JSON.stringify(summaryRecords),
  });

  const summaryChunks: BookChunk[] = summaryRecords.map((s) => ({
    id: `${bookId}-summary-${s.chapterIndex}`,
    bookId,
    chapterIndex: s.chapterIndex,
    chapterTitle: s.chapterTitle,
    chunkIndex: -1,
    content: s.fullSummary,
    type: "summary" as const,
  }));
  logInfo(`[Resume] Created ${summaryChunks.length} summary chunks from ${summaries.length} summaries`);

  // Submit embedding batch for text chunks + summary chunks
  const allChunks = [...storedData.textChunks, ...summaryChunks];
  logInfo(`[Resume] Submitting ${allChunks.length} chunks for batch embedding`);
  const { batchId, inputFileId } = await submitBatchEmbeddings(allChunks);

  await updateBook(bookId, {
    summaryBatchId: null,
    summaryBatchFileId: null,
    summaryBatchChapters: null,
    batchId,
    batchFileId: inputFileId,
    batchChunks: JSON.stringify(allChunks),
  });

  logInfo(`[Resume] Embedding batch submitted (${batchId}). Run resume again when batch completes.`);
  return { status: "embeddings_submitted" as const, batchId, phase: "embedding" as const };
};

export const resumeLocalIngest = async (bookId: string, resumePath: string, currentChunkCount: number) => {
  const state = await loadResumeState(bookId, resumePath);
  const total = state.chunks.length;
  const startIndex = Math.max(state.resumeIndex, currentChunkCount);

  if (startIndex >= total) {
    await finalizeResumeState(bookId, resumePath);
    throw new Error(`Resume state already completed for book ${bookId}.`);
  }

  logInfo(`[Resume] Resuming local embeddings at chunk ${startIndex + 1}/${total}`);
  const embedStart = Date.now();
  const remaining = state.chunks.slice(startIndex);
  const embeddedRemaining = await embedChunks(remaining, {
    onBatch: async (embeddedBatch, progress) => {
      const completed = startIndex + progress.completed;
      await addChunksToIndex(bookId, embeddedBatch);
      await updateBook(bookId, { chunkCount: completed });
      await writeFile(
        resumePath,
        JSON.stringify({ chunks: state.chunks, resumeIndex: completed })
      );
    },
  });

  logInfo(`[Resume] Embedded ${embeddedRemaining.length} remaining chunks (${formatDuration(Date.now() - embedStart)})`);

  const finalCount = startIndex + embeddedRemaining.length;
  await updateBook(bookId, {
    chunkCount: finalCount,
    indexedAt: Date.now(),
  });
  await finalizeResumeState(bookId, resumePath);

  return { status: "completed" as const, chunkCount: finalCount };
};
