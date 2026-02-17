import { mkdir } from "node:fs/promises";
import { loadConfig } from "../config.js";
import { logInfo, logWarn } from "../commands/io.js";

export const CHUNK_SIZE: number = 1000;
export const CHUNK_OVERLAP: number = 100;
export const SEPARATORS = ["\n\n", "\n", ". ", " ", ""] as const;

export const SUMMARY_MAX_TOKENS = 30000;
export const SUMMARY_CONCURRENCY = 3;
export const SUMMARY_TARGET_WORDS = 250;

export type ResolvedPaths = {
  dataDir: string;
  booksDir: string;
  vectorsDir: string;
  dbPath: string;
};

export const resolvePaths = async (): Promise<ResolvedPaths> => {
  const config = await loadConfig();
  const dataDir = config.dataDir;
  return {
    dataDir,
    booksDir: `${dataDir}/books`,
    vectorsDir: `${dataDir}/vectors`,
    dbPath: `${dataDir}/metadata.db`,
  };
};

export const ensureDataDirs = async () => {
  const paths = await resolvePaths();
  await mkdir(paths.dataDir, { recursive: true });
  await mkdir(paths.booksDir, { recursive: true });
  await mkdir(paths.vectorsDir, { recursive: true });
  return paths;
};

export const getModels = async () => {
  const config = await loadConfig();
  return config.models;
};

export const isAskEnabled = async () => {
  const config = await loadConfig();
  return config.askEnabled;
};

export const requireOpenAIKey = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Export it to use embeddings and chat.");
  }
};

export { logInfo, logWarn };
