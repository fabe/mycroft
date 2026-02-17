import { configPath, loadConfig } from "../config.js";
import { stdout } from "./io.js";

export const resolveConfigCommand = async () => {
  const path = configPath();
  const config = await loadConfig();
  stdout(`Config: ${path}`);
  stdout(`Data dir: ${config.dataDir}`);
  stdout(`Ask enabled: ${config.askEnabled}`);
  stdout(`Models: embedding=${config.models.embedding} summary=${config.models.summary} chat=${config.models.chat}`);
};
