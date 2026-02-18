import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../dist/cli.js");

const run = async (...args: string[]) => {
  try {
    const result = await exec("node", [CLI, ...args], {
      timeout: 10_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
      exitCode: err.code ?? 1,
    };
  }
};

describe("CLI smoke tests", () => {
  describe("root command", () => {
    it("shows help with --help", async () => {
      const { stdout, exitCode } = await run("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mycroft");
      expect(stdout).toContain("Ingest EPUBs");
      expect(stdout).toContain("book");
      expect(stdout).toContain("config");
      expect(stdout).toContain("chat");
    });

    it("shows version with --version", async () => {
      // --version triggers exitOverride, may output via stdout or stderr
      const result = await run("--version");
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/\d+\.\d+\.\d+/);
    });

    it("includes --data-dir option in help", async () => {
      const { stdout } = await run("--help");
      expect(stdout).toContain("--data-dir");
      expect(stdout).toContain("Override data directory");
    });
  });

  describe("book subcommand", () => {
    it("lists all book subcommands in help", async () => {
      const { stdout, exitCode } = await run("book", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Manage books and queries");

      const expectedSubcommands = [
        "ingest",
        "list",
        "show",
        "ask",
        "search",
        "delete",
      ];
      for (const sub of expectedSubcommands) {
        expect(stdout).toContain(sub);
      }
    });

    it("shows ingest usage", async () => {
      const { stdout, exitCode } = await run("book", "ingest", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Ingest an EPUB file");
      expect(stdout).toContain("<path>");
    });

    it("shows ask usage with question argument", async () => {
      const { stdout, exitCode } = await run("book", "ask", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("<id>");
      expect(stdout).toContain("<question>");
    });
  });

  describe("config subcommand", () => {
    it("lists all config subcommands in help", async () => {
      const { stdout, exitCode } = await run("config", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Manage configuration");

      const expectedSubcommands = ["path", "init", "resolve", "onboard"];
      for (const sub of expectedSubcommands) {
        expect(stdout).toContain(sub);
      }
    });
  });

  describe("chat subcommand", () => {
    it("lists all chat subcommands in help", async () => {
      const { stdout, exitCode } = await run("chat", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Run multi-turn chat sessions");

      const expectedSubcommands = ["start", "ask", "list", "show", "repl"];
      for (const sub of expectedSubcommands) {
        expect(stdout).toContain(sub);
      }
    });

    it("shows start usage with book id argument", async () => {
      const { stdout, exitCode } = await run("chat", "start", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("<id>");
    });

    it("shows ask usage with session and question arguments", async () => {
      const { stdout, exitCode } = await run("chat", "ask", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("<session>");
      expect(stdout).toContain("<question>");
    });
  });

  describe("error handling", () => {
    it("exits with error for unknown command", async () => {
      const result = await run("nonexistent");
      // Commander shows an error for unknown commands
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/unknown command|error/i);
    });

    it("exits with error when book ingest called without path", async () => {
      const result = await run("book", "ingest");
      // Commander requires the <path> argument
      expect(result.exitCode).not.toBe(0);
    });
  });
});
