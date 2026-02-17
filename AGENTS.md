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

## Environment

- `OPENAI_API_KEY` is required for embeddings and chat.
- `MYCROFT_DATA_DIR` and `MYCROFT_CONFIG` override paths.

## Tests

There are no automated tests in this repo. Use manual CLI runs for verification.

## Release checklist

- `npm run build`
- `npm pack` and inspect contents
- Update version in `package.json`
- Update `README.md` and `SKILL.md` if commands change
