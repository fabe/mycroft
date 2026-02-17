import { getBooks } from "../db/queries.js";

export const resolveBookId = async (input: string): Promise<string | null> => {
  const books = await getBooks();
  const exact = books.find((book) => book.id === input);
  if (exact) return exact.id;
  const matches = books.filter((book) => book.id.startsWith(input));
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    throw new Error(`Ambiguous id prefix "${input}" (${matches.length} matches)`);
  }
  return null;
};
