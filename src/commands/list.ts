import { getBooks } from "../db/queries.js";
import { ensureDataDirs } from "../services/constants.js";
import { stdout } from "./io.js";

const formatDate = (timestamp: number | null) => {
  if (!timestamp) return "-";
  return new Date(timestamp).toISOString().slice(0, 10);
};

export const listCommand = async () => {
  await ensureDataDirs();
  const books = await getBooks();
  if (books.length === 0) {
    stdout("No books indexed yet.");
    return;
  }

  stdout("ID       | Title | Author | Chunks | Indexed | Status");
  stdout("---------|-------|--------|--------|--------|-------");
  for (const book of books) {
    const shortId = book.id.slice(0, 8);
    const title = book.title;
    const author = book.author || "-";
    const chunks = String(book.chunkCount ?? 0);
    const indexed = formatDate(book.indexedAt);
    const status = book.indexedAt
      ? "[indexed]"
      : book.batchId
        ? "[batch pending]"
        : book.ingestState === "pending"
          ? "[resume pending]"
          : "[pending]";
    stdout(`${shortId} | ${title} | ${author} | ${chunks} | ${indexed} | ${status}`);
  }
};
