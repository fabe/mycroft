import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type ConfigModels = {
  embedding: string;
  summary: string;
  chat: string;
};

export type AppConfig = {
  dataDir: string;
  askEnabled: boolean;
  models: ConfigModels;
};

const DEFAULT_CONFIG: AppConfig = {
  dataDir: "~/.local/share/mycroft",
  askEnabled: true,
  models: {
    embedding: "text-embedding-3-small",
    summary: "gpt-5-nano",
    chat: "gpt-5.1",
  },
};

const expandHome = (input: string): string => {
  if (!input.startsWith("~")) return input;
  return join(homedir(), input.slice(1));
};

const resolvePath = (input: string): string => resolve(expandHome(input));

const getConfigPath = (): string => {
  const override = process.env.MYCROFT_CONFIG;
  if (override) return resolvePath(override);
  return resolvePath("~/.config/mycroft/config.json");
};

const normalizeModels = (models?: Partial<ConfigModels>): ConfigModels => ({
  embedding: models?.embedding || DEFAULT_CONFIG.models.embedding,
  summary: models?.summary || DEFAULT_CONFIG.models.summary,
  chat: models?.chat || DEFAULT_CONFIG.models.chat,
});

type ConfigOverrides = {
  dataDir?: string;
};

let overrides: ConfigOverrides = {};

export const setConfigOverrides = (next: ConfigOverrides) => {
  overrides = { ...overrides, ...next };
};

const normalizeConfig = (input: Partial<AppConfig> | null): AppConfig => {
  const dataDirEnv = process.env.MYCROFT_DATA_DIR;
  const dataDir = overrides.dataDir || dataDirEnv || input?.dataDir || DEFAULT_CONFIG.dataDir;
  return {
    dataDir,
    askEnabled: input?.askEnabled ?? DEFAULT_CONFIG.askEnabled,
    models: normalizeModels(input?.models),
  };
};

const readConfigFile = async (path: string): Promise<Partial<AppConfig> | null> => {
  try {
    const contents = await readFile(path, "utf-8");
    return JSON.parse(contents) as Partial<AppConfig>;
  } catch {
    return null;
  }
};

export const loadConfig = async (): Promise<AppConfig> => {
  const configPath = getConfigPath();
  const data = await readConfigFile(configPath);
  const normalized = normalizeConfig(data);
  return {
    ...normalized,
    dataDir: resolvePath(normalized.dataDir),
  };
};

export const ensureConfigDirs = async (configPath?: string) => {
  const path = configPath || getConfigPath();
  await mkdir(dirname(path), { recursive: true });
};

export const configPath = () => getConfigPath();
