import { describe, it, expect, vi, beforeEach } from "vitest";

describe("constants", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  const loadModule = async (configOverride?: Record<string, unknown>) => {
    // Mock loadConfig to return controlled values
    vi.doMock("../../src/config.js", () => ({
      loadConfig: vi.fn(async () => ({
        dataDir: "/tmp/mycroft-test-data",
        askEnabled: true,
        models: {
          embedding: "text-embedding-3-small",
          summary: "gpt-4o-mini",
          chat: "gpt-4o",
        },
        ...configOverride,
      })),
    }));

    // Mock io to avoid side effects
    vi.doMock("../../src/commands/io.js", () => ({
      logInfo: vi.fn(),
      logWarn: vi.fn(),
    }));

    // Mock mkdir to avoid filesystem operations
    vi.doMock("node:fs/promises", async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      return { ...actual, mkdir: vi.fn(async () => undefined) };
    });

    return await import("../../src/services/constants.js");
  };

  describe("exported constants", () => {
    it("exports CHUNK_SIZE as 1000", async () => {
      const mod = await loadModule();
      expect(mod.CHUNK_SIZE).toBe(1000);
    });

    it("exports CHUNK_OVERLAP as 100", async () => {
      const mod = await loadModule();
      expect(mod.CHUNK_OVERLAP).toBe(100);
    });

    it("exports SEPARATORS array", async () => {
      const mod = await loadModule();
      expect(mod.SEPARATORS).toEqual(["\n\n", "\n", ". ", " ", ""]);
    });

    it("exports SUMMARY_MAX_TOKENS as 30000", async () => {
      const mod = await loadModule();
      expect(mod.SUMMARY_MAX_TOKENS).toBe(30000);
    });

    it("exports SUMMARY_CONCURRENCY as 3", async () => {
      const mod = await loadModule();
      expect(mod.SUMMARY_CONCURRENCY).toBe(3);
    });

    it("exports SUMMARY_TARGET_WORDS as 250", async () => {
      const mod = await loadModule();
      expect(mod.SUMMARY_TARGET_WORDS).toBe(250);
    });
  });

  describe("resolvePaths", () => {
    it("resolves paths relative to the configured dataDir", async () => {
      const mod = await loadModule();
      const paths = await mod.resolvePaths();

      expect(paths.dataDir).toBe("/tmp/mycroft-test-data");
      expect(paths.booksDir).toBe("/tmp/mycroft-test-data/books");
      expect(paths.vectorsDir).toBe("/tmp/mycroft-test-data/vectors");
      expect(paths.ingestDir).toBe("/tmp/mycroft-test-data/ingest");
      expect(paths.dbPath).toBe("/tmp/mycroft-test-data/metadata.db");
    });

    it("uses the dataDir from config", async () => {
      const mod = await loadModule({ dataDir: "/custom/path" });
      const paths = await mod.resolvePaths();

      expect(paths.dataDir).toBe("/custom/path");
      expect(paths.booksDir).toBe("/custom/path/books");
    });
  });

  describe("ensureDataDirs", () => {
    it("calls mkdir for all directories", async () => {
      const mod = await loadModule();
      const { mkdir } = await import("node:fs/promises");

      await mod.ensureDataDirs();

      expect(mkdir).toHaveBeenCalledWith("/tmp/mycroft-test-data", { recursive: true });
      expect(mkdir).toHaveBeenCalledWith("/tmp/mycroft-test-data/books", { recursive: true });
      expect(mkdir).toHaveBeenCalledWith("/tmp/mycroft-test-data/vectors", { recursive: true });
      expect(mkdir).toHaveBeenCalledWith("/tmp/mycroft-test-data/ingest", { recursive: true });
    });

    it("returns the resolved paths", async () => {
      const mod = await loadModule();
      const paths = await mod.ensureDataDirs();

      expect(paths).toEqual({
        dataDir: "/tmp/mycroft-test-data",
        booksDir: "/tmp/mycroft-test-data/books",
        vectorsDir: "/tmp/mycroft-test-data/vectors",
        ingestDir: "/tmp/mycroft-test-data/ingest",
        dbPath: "/tmp/mycroft-test-data/metadata.db",
      });
    });
  });

  describe("getModels", () => {
    it("returns the configured models", async () => {
      const mod = await loadModule();
      const models = await mod.getModels();

      expect(models).toEqual({
        embedding: "text-embedding-3-small",
        summary: "gpt-4o-mini",
        chat: "gpt-4o",
      });
    });

    it("returns custom models from config", async () => {
      const mod = await loadModule({
        models: {
          embedding: "custom-embed",
          summary: "custom-summary",
          chat: "custom-chat",
        },
      });
      const models = await mod.getModels();

      expect(models.embedding).toBe("custom-embed");
      expect(models.summary).toBe("custom-summary");
      expect(models.chat).toBe("custom-chat");
    });
  });

  describe("isAskEnabled", () => {
    it("returns true when askEnabled is true in config", async () => {
      const mod = await loadModule({ askEnabled: true });
      expect(await mod.isAskEnabled()).toBe(true);
    });

    it("returns false when askEnabled is false in config", async () => {
      const mod = await loadModule({ askEnabled: false });
      expect(await mod.isAskEnabled()).toBe(false);
    });
  });

  describe("requireOpenAIKey", () => {
    it("throws when OPENAI_API_KEY is not set", async () => {
      const mod = await loadModule();
      const original = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      expect(() => mod.requireOpenAIKey()).toThrow("OPENAI_API_KEY is not set");

      if (original) process.env.OPENAI_API_KEY = original;
    });

    it("does not throw when OPENAI_API_KEY is set", async () => {
      const mod = await loadModule();
      const original = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      expect(() => mod.requireOpenAIKey()).not.toThrow();

      if (original) {
        process.env.OPENAI_API_KEY = original;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });

  describe("config caching", () => {
    it("calls loadConfig only once across multiple resolvePaths calls", async () => {
      const mod = await loadModule();
      const { loadConfig } = await import("../../src/config.js");

      await mod.resolvePaths();
      await mod.resolvePaths();
      await mod.getModels();

      // loadConfig should only have been called once due to caching
      expect(loadConfig).toHaveBeenCalledTimes(1);
    });
  });
});
