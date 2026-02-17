export type QueryOptions = {
  topK: number;
  maxChapter?: number;
};

export const parseQueryOptions = (options: { topK: string; maxChapter?: string }): QueryOptions => {
  const topK = Number(options.topK);
  if (!Number.isFinite(topK) || topK <= 0) {
    throw new Error("--top-k must be a positive number.");
  }
  let maxChapter: number | undefined;
  if (options.maxChapter !== undefined) {
    const parsed = Number(options.maxChapter);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("--max-chapter must be a non-negative number.");
    }
    maxChapter = parsed;
  }

  return { topK, maxChapter };
};
