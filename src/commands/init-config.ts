import { ensureConfigDirs, configPath, loadConfig } from "../config.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { stdout } from "./io.js";

export const initConfigCommand = async () => {
  const path = configPath();
  await ensureConfigDirs(path);
  try {
    await access(path);
    stdout(`Config already exists: ${path}`);
    return;
  } catch {
    // file does not exist
  }
  const resolved = await loadConfig();
  const template = {
    dataDir: "~/.local/share/mycroft",
    askEnabled: resolved.askEnabled,
    models: resolved.models,
  };
  await writeFile(path, JSON.stringify(template, null, 2), "utf-8");
  await mkdir(resolved.dataDir, { recursive: true });
  stdout(`Created config at ${path}`);
};
