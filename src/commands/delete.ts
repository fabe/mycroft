import { unlink } from "node:fs/promises";
import { deleteBook, getBook } from "../db/queries";
import { resolveBookId } from "./utils";
import { deleteBookIndex } from "../services/vector-store";
import { ensureDataDirs } from "../services/constants";
import { confirm } from "./prompt";
import { isInteractive, stdout } from "./io";

export const deleteCommand = async (id: string, options: { force?: boolean }) => {
  await ensureDataDirs();
  const resolvedId = await resolveBookId(id);
  if (!resolvedId) {
    throw new Error(`Book not found: ${id}`);
  }
  const book = await getBook(resolvedId);
  if (!book) {
    throw new Error(`Book not found: ${id}`);
  }

  if (!options.force) {
    if (!isInteractive()) {
      throw new Error("Delete confirmation requires an interactive terminal. Use --force to bypass.");
    }
    const ok = await confirm(`Delete "${book.title}" (${book.id})? [y/N] `);
    if (!ok) {
      stdout("Cancelled.");
      return;
    }
  }

  await deleteBook(resolvedId);
  await deleteBookIndex(resolvedId);
  if (book.epubPath) {
    await unlink(book.epubPath).catch(() => undefined);
  }
  stdout(`Deleted book ${book.id}`);
};
