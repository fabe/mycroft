#!/usr/bin/env node
import { Command } from "commander";
import { setConfigOverrides } from "./config";
import { printError } from "./commands/io";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerBookIngest } from "./commands/book/ingest";
import { registerBookList } from "./commands/book/list";
import { registerBookShow } from "./commands/book/show";
import { registerBookAsk } from "./commands/book/ask";
import { registerBookSearch } from "./commands/book/search";
import { registerBookDelete } from "./commands/book/delete";
import { registerConfigPath } from "./commands/config/path";
import { registerConfigInit } from "./commands/config/init";
import { registerConfigResolve } from "./commands/config/resolve";
import { registerConfigOnboard } from "./commands/config/onboard";

const resolveVersion = async () => {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(currentDir, "../package.json");
    const raw = await readFile(pkgPath, "utf-8");
    return JSON.parse(raw).version || "0.1.0";
  } catch {
    return "0.1.0";
  }
};

const program = new Command();
const configureProgram = async () => {
  program
    .name("mycroft")
    .description("Ingest EPUBs, build a local index, and answer questions")
    .version(await resolveVersion())
    .option("--data-dir <path>", "Override data directory")
    .hook("preAction", (cmd) => {
      const opts = cmd.opts();
      if (opts.dataDir) {
        setConfigOverrides({ dataDir: opts.dataDir });
      }
    });
};

const registerCommands = () => {
  const book = program.command("book").description("Manage books and queries");
  registerBookIngest(book);
  registerBookList(book);
  registerBookShow(book);
  registerBookAsk(book);
  registerBookSearch(book);
  registerBookDelete(book);

  const config = program.command("config").description("Manage configuration");
  registerConfigPath(config);
  registerConfigInit(config);
  registerConfigResolve(config);
  registerConfigOnboard(config);
};

program.exitOverride((error) => {
  if (error.code === "commander.helpDisplayed") {
    process.exit(0);
  }
  throw error;
});

const main = async () => {
  try {
    await configureProgram();
    registerCommands();
    await program.parseAsync(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(message);
    process.exit(1);
  }
};

main();
