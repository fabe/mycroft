# Agent Guide

## Project overview

mycroft is a CLI for ingesting EPUBs, building a local vector index, and answering questions with retrieval-augmented prompts.

## Quickstart

```bash
npm install
npm run build
node dist/cli.js --help
```

## Runbook

```bash
mycroft config onboard
mycroft book ingest /path/to/book.epub
mycroft book ingest /path/to/book.epub --batch
mycroft book ingest /path/to/book.epub --batch --summary
mycroft book ingest status <id>
mycroft book ingest resume <id>
mycroft book ask <id> "What is the main conflict?"
mycroft chat start <id>
mycroft chat ask <session> "What does this foreshadow?"
mycroft chat repl <session>
```

## Architecture

- `src/cli.ts` is the entry point and registers commands.
- `src/commands/` contains command handlers.
- `src/services/` contains ingestion, chunking, embeddings, and chat/RAG logic.
- `src/db/` manages SQLite schema and queries.
- `completions/` contains shell completions.

## Technology stack and choices

- Language/runtime: Node.js (ESM) with TypeScript for strict type checking and modern module semantics.
- CLI framework: `commander` for nested subcommands and consistent help output.
- AI + embeddings: `ai` with `@ai-sdk/openai` for streaming/chat and embeddings.
- Vector index: `vectra` local index for fast, offline retrieval per book.
- Storage: `better-sqlite3` for simple, local metadata persistence (books + chat sessions).
- EPUB parsing: `@lingo-reader/epub-parser` to extract chapters and metadata.
- Output UX: `chalk` with TTY detection for readable CLI messaging.

## Data storage

- Config: `~/.config/mycroft/config.json`
- Data dir: `~/.local/share/mycroft`
- SQLite DB: `metadata.db` in the data dir
- Resume state: `ingest/` in the data dir

## Environment

- `OPENAI_API_KEY` is required for embeddings and chat.
- `MYCROFT_DATA_DIR` and `MYCROFT_CONFIG` override paths.

## Notes

- `--batch` runs both embeddings and summaries via the OpenAI Batch API; batch ingests return immediately.
- When `--batch --summary` is used, the summary batch runs first. On resume, summary results are processed and an embedding batch is submitted.
- Use `mycroft book ingest status <id>` to check batch progress without resuming.
- Use `mycroft book ingest resume <id>` to advance to the next phase or complete batch ingests.

## Tests

Run the test suite with `npm test`. Run with coverage via `npm run test:coverage`. Use `npm run test:watch` for development.

The suite uses **Vitest** (v4) with native ESM + TypeScript support. No `OPENAI_API_KEY` is needed -- all AI calls are mocked.

### Test files (161 tests across 14 files)

| File | What it covers |
|---|---|
| `tests/shared/utils.test.ts` | `estimateTokens`, `renderSources`, `resolveMaxChapter`, `formatContext` |
| `tests/shared/summary.test.ts` | `SUMMARY_PROMPT`, `parseStructuredSummary`, `splitIntoSections` |
| `tests/services/chunker.test.ts` | Recursive text splitting, overlap, chunk IDs |
| `tests/services/embedder.test.ts` | Batching, `onBatch` callback, empty input |
| `tests/services/summarizer.test.ts` | Single-pass, two-pass, concurrency, error handling |
| `tests/services/chat.test.ts` | `chatAsk` end-to-end, session lifecycle, message persistence |
| `tests/services/ingest.test.ts` | Full parse->chunk->embed->index pipeline |
| `tests/services/vector-store.test.ts` | Vectra index CRUD, query filtering by `maxChapterIndex` |
| `tests/services/epub-parser.test.ts` | Fixture-based EPUB parsing (skips gracefully if no fixture) |
| `tests/services/constants.test.ts` | Path resolution, `ensureDataDirs`, config caching, `requireOpenAIKey` |
| `tests/db/queries.test.ts` | Full CRUD for books/sessions/messages, cascades, JOINs |
| `tests/db/schema.test.ts` | Table creation, migrations, foreign keys, idempotency |
| `tests/config.test.ts` | Defaults, env overrides, file loading, `setConfigOverrides` |
| `tests/cli.test.ts` | CLI smoke tests: `--help`, `--version`, all subcommand trees |

### Mocking patterns and gotchas

- **AI SDK mocks**: Use `MockLanguageModelV3` and `MockEmbeddingModelV3` from `ai/test`. Since services hardcode `openai()` internally, intercept at module level with `vi.mock('@ai-sdk/openai')` to return mock models.
- **MockEmbeddingModelV3** requires `maxEmbeddingsPerCall: null` for unlimited batch size.
- **MockLanguageModelV3** response shape: `content: [{ type: 'text', text }]`, `finishReason: { unified: 'stop', raw: undefined }`, `usage: { inputTokens: { total, noCache }, outputTokens: { total, text } }`.
- **For `streamText`**: `doStream` must return `{ stream: simulateReadableStream({ chunks }) }` with chunk types `text-start`, `text-delta`, `text-end`, `finish`.
- **DB tests**: Use in-memory SQLite (`:memory:`) by mocking `createDb` from `src/db/schema.js`. The queries module uses a lazy singleton `dbPromise` -- tests must call `vi.resetModules()` in `beforeEach` and re-import to get fresh connections.
- **Config tests**: The config module has a module-level `overrides` variable -- use `vi.resetModules()` to clear state between tests.
- **Constants tests**: The module caches config in a module-level variable -- same `vi.resetModules()` pattern applies.
- **Vector-store tests**: Use a real temp directory (cleaned up in `afterEach`) since Vectra needs disk. Mock `ensureDataDirs` to point at the temp dir.
- **Ingest tests**: Must mock `node:fs/promises` (`copyFile`, `mkdir`, `writeFile`, `unlink`), `vector-store.js`, `epub-parser.js`, and `@ai-sdk/openai`.
- **EPUB parser tests**: Place a test EPUB at `tests/fixtures/test.epub`. Tests use `describe.skipIf(!hasFixture)` so they skip gracefully if absent. Note: the upstream epub parser (jszip) throws an unhandled rejection for non-epub files rather than a catchable error, so there's no "invalid file" test.
- **CLI smoke tests**: Run `node dist/cli.js` as a child process -- requires `npm run build` first. The `--version` flag triggers Commander's `exitOverride`, so it exits non-zero even on success.

### What's not tested (and why)

- `src/commands/` -- thin Commander glue that wires args to service calls. Already exercised by CLI smoke tests; unit-testing would just mean mocking every service and asserting stdout, which is fragile.
- `src/services/batch-embedder.ts` / `batch-summarizer.ts` -- OpenAI Batch API wrappers (file upload, poll, download). Would require mocking the entire OpenAI files/batches API surface for low value.
- Batch paths in `src/services/ingest.ts` -- orchestration over the batch modules above.

## Release checklist

- `npm run build`
- `npm pack` and inspect contents
- Update version in `package.json`
- Update `README.md` and `SKILL.md` if commands change
