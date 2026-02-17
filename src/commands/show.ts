import { getBook } from "../db/queries";
import { resolveBookId } from "./utils";
import { ensureDataDirs } from "../services/constants";
import { stdout } from "./io";

export const showCommand = async (id: string) => {
  await ensureDataDirs();
  const resolvedId = await resolveBookId(id);
  if (!resolvedId) {
    throw new Error(`Book not found: ${id}`);
  }
  const book = await getBook(resolvedId);
  if (!book) {
    throw new Error(`Book not found: ${id}`);
  }

  stdout(`Title: ${book.title}`);
  stdout(`Author: ${book.author ?? "-"}`);
  stdout(`ID: ${book.id}`);
  stdout(`Chunks: ${book.chunkCount}`);
  stdout(`Indexed: ${book.indexedAt ? new Date(book.indexedAt).toISOString() : "-"}`);
  stdout(`Narrative range: ${book.narrativeStartIndex ?? 0} to ${book.narrativeEndIndex ?? book.chapters.length - 1}`);
  stdout(`Progress chapter: ${book.progressChapter ?? "-"}`);
  stdout("\nChapters:");

  book.chapters.forEach((title: string, index: number) => {
    const marker = index === book.narrativeStartIndex ? "[start]" : index === book.narrativeEndIndex ? "[end]" : "";
    stdout(`  [${index}] ${title} ${marker}`.trim());
  });
};
