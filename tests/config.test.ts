import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// We need to test config.ts in isolation, so we reset modules for each test
// to clear the cached overrides and module state.

describe("config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mycroft-config-test-"));
    // Clear env vars that could interfere
    delete process.env.MYCROFT_CONFIG;
    delete process.env.MYCROFT_DATA_DIR;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.MYCROFT_CONFIG;
    delete process.env.MYCROFT_DATA_DIR;
  });

  const loadFreshConfig = async () => {
    vi.resetModules();
    return await import("../src/config.js");
  };

  describe("loadConfig", () => {
    it("returns defaults when no config file exists", async () => {
      process.env.MYCROFT_CONFIG = join(tempDir, "nonexistent.json");
      const { loadConfig } = await loadFreshConfig();
      const config = await loadConfig();

      expect(config.askEnabled).toBe(true);
      expect(config.models.embedding).toBe("text-embedding-3-small");
      expect(config.models.summary).toBe("gpt-5-nano");
      expect(config.models.chat).toBe("gpt-5.1");
      expect(config.dataDir).toContain("mycroft");
    });

    it("loads config from file and merges with defaults", async () => {
      const configPath = join(tempDir, "config.json");
      await writeFile(
        configPath,
        JSON.stringify({
          askEnabled: false,
          models: { chat: "gpt-4o" },
        })
      );
      process.env.MYCROFT_CONFIG = configPath;

      const { loadConfig } = await loadFreshConfig();
      const config = await loadConfig();

      expect(config.askEnabled).toBe(false);
      expect(config.models.chat).toBe("gpt-4o");
      // Non-specified models should fall back to defaults
      expect(config.models.embedding).toBe("text-embedding-3-small");
      expect(config.models.summary).toBe("gpt-5-nano");
    });

    it("respects MYCROFT_DATA_DIR env var", async () => {
      process.env.MYCROFT_CONFIG = join(tempDir, "nonexistent.json");
      process.env.MYCROFT_DATA_DIR = "/custom/data/dir";

      const { loadConfig } = await loadFreshConfig();
      const config = await loadConfig();

      expect(config.dataDir).toBe("/custom/data/dir");
    });

    it("config file dataDir is used when no env override", async () => {
      const configPath = join(tempDir, "config.json");
      await writeFile(
        configPath,
        JSON.stringify({ dataDir: "/from/config/file" })
      );
      process.env.MYCROFT_CONFIG = configPath;

      const { loadConfig } = await loadFreshConfig();
      const config = await loadConfig();

      expect(config.dataDir).toBe("/from/config/file");
    });

    it("MYCROFT_DATA_DIR takes precedence over config file", async () => {
      const configPath = join(tempDir, "config.json");
      await writeFile(
        configPath,
        JSON.stringify({ dataDir: "/from/config/file" })
      );
      process.env.MYCROFT_CONFIG = configPath;
      process.env.MYCROFT_DATA_DIR = "/from/env";

      const { loadConfig } = await loadFreshConfig();
      const config = await loadConfig();

      expect(config.dataDir).toBe("/from/env");
    });

    it("handles malformed config file gracefully (falls back to defaults)", async () => {
      const configPath = join(tempDir, "config.json");
      await writeFile(configPath, "not valid json {{{");
      process.env.MYCROFT_CONFIG = configPath;

      const { loadConfig } = await loadFreshConfig();
      const config = await loadConfig();

      // Should fall back to defaults
      expect(config.askEnabled).toBe(true);
      expect(config.models.embedding).toBe("text-embedding-3-small");
    });
  });

  describe("setConfigOverrides", () => {
    it("overrides dataDir via programmatic config", async () => {
      process.env.MYCROFT_CONFIG = join(tempDir, "nonexistent.json");

      const { loadConfig, setConfigOverrides } = await loadFreshConfig();
      setConfigOverrides({ dataDir: "/overridden/path" });
      const config = await loadConfig();

      expect(config.dataDir).toBe("/overridden/path");
    });

    it("programmatic override takes precedence over env and config file", async () => {
      const configPath = join(tempDir, "config.json");
      await writeFile(configPath, JSON.stringify({ dataDir: "/from/file" }));
      process.env.MYCROFT_CONFIG = configPath;
      process.env.MYCROFT_DATA_DIR = "/from/env";

      const { loadConfig, setConfigOverrides } = await loadFreshConfig();
      setConfigOverrides({ dataDir: "/from/override" });
      const config = await loadConfig();

      expect(config.dataDir).toBe("/from/override");
    });
  });

  describe("configPath", () => {
    it("returns default path when no env override", async () => {
      delete process.env.MYCROFT_CONFIG;
      const { configPath } = await loadFreshConfig();
      const path = configPath();

      expect(path).toContain(".config");
      expect(path).toContain("mycroft");
      expect(path).toContain("config.json");
    });

    it("respects MYCROFT_CONFIG env var", async () => {
      process.env.MYCROFT_CONFIG = "/custom/path/config.json";
      const { configPath } = await loadFreshConfig();
      const path = configPath();

      expect(path).toBe("/custom/path/config.json");
    });
  });

  describe("ensureConfigDirs", () => {
    it("creates the config directory", async () => {
      const configPath = join(tempDir, "subdir", "config.json");
      const { ensureConfigDirs } = await loadFreshConfig();

      await ensureConfigDirs(configPath);

      // The parent directory should now exist
      const { existsSync } = await import("node:fs");
      expect(existsSync(join(tempDir, "subdir"))).toBe(true);
    });
  });
});
