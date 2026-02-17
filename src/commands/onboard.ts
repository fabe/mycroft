import { ensureConfigDirs, configPath, loadConfig } from "../config";
import { writeFile } from "node:fs/promises";
import { prompt } from "./prompt";
import { isInteractive, stdout } from "./io";

const isDefault = (input: string) => input === "" || input.toLowerCase() === "-y";

const parseBoolean = (input: string, fallback: boolean) => {
  if (isDefault(input)) return fallback;
  const normalized = input.toLowerCase();
  if (["y", "yes", "true", "1"].includes(normalized)) return true;
  if (["n", "no", "false", "0"].includes(normalized)) return false;
  return fallback;
};

export const onboardCommand = async () => {
  if (!isInteractive()) {
    throw new Error("Onboarding requires an interactive terminal.");
  }
  const defaults = await loadConfig();
  const path = configPath();

  stdout("\nEPUB RAG setup");
  stdout("Press Enter or type -y to accept defaults.");

  const dataDirInput = await prompt(`Data directory [${defaults.dataDir}]: `);
  const dataDir = isDefault(dataDirInput) ? defaults.dataDir : dataDirInput;

  const askEnabledInput = await prompt(`Enable ask (LLM answers) [${defaults.askEnabled ? "Y" : "N"}]: `);
  const askEnabled = parseBoolean(askEnabledInput, defaults.askEnabled);

  const embeddingInput = await prompt(`Embedding model [${defaults.models.embedding}]: `);
  const embedding = isDefault(embeddingInput) ? defaults.models.embedding : embeddingInput;

  const summaryInput = await prompt(`Summary model [${defaults.models.summary}]: `);
  const summary = isDefault(summaryInput) ? defaults.models.summary : summaryInput;

  const chatInput = await prompt(`Chat model [${defaults.models.chat}]: `);
  const chat = isDefault(chatInput) ? defaults.models.chat : chatInput;

  await ensureConfigDirs(path);
  await writeFile(
    path,
    JSON.stringify(
      {
        dataDir,
        askEnabled,
        models: {
          embedding,
          summary,
          chat,
        },
      },
      null,
      2
    ),
    "utf-8"
  );

  stdout("\nSetup complete.");
  stdout(`Config: ${path}`);
  stdout(`Data dir: ${dataDir}`);

  if (!process.env.OPENAI_API_KEY) {
    stdout("\nOPENAI_API_KEY is not set.");
    stdout("Export it to enable embeddings and chat:");
    stdout("  export OPENAI_API_KEY=\"...\"");
  }

  stdout("\nNext step:");
  stdout("  mycroft book ingest /path/to/book.epub");
};
