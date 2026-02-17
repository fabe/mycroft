# mycroft-cli

Command-line tool that ingests EPUB files, builds a local searchable index, and answers questions using a retrieval-augmented workflow.

## Requirements

- Node.js >= 18

## Install

```bash
npm install -g @fs/mycroft
```

Ensure `node` is on your PATH (the CLI uses Node.js as its runtime).

## Usage

```bash
mycroft book list
mycroft book ingest /path/to/book.epub
mycroft book ask <id> "What is the main conflict?"
mycroft config init
mycroft config resolve
mycroft config onboard
```

## Local dev

```bash
npm install
npm run build
node dist/cli.js --help
```

## Config

Default config path:

```
~/.config/mycroft/config.json
```

Default config:

```json
{
  "dataDir": "~/.local/share/mycroft",
  "askEnabled": true,
  "models": {
    "embedding": "text-embedding-3-small",
    "summary": "gpt-5-nano",
    "chat": "gpt-5.1"
  }
}
```

Environment overrides:

- `MYCROFT_DATA_DIR`
- `MYCROFT_CONFIG`
- `OPENAI_API_KEY`

`OPENAI_API_KEY` is required for embeddings, search, and Q&A (and for summaries if enabled).

CLI overrides:

- `--data-dir <path>` (global)
- `--max-chapter <n>`
- `--top-k <n>`
- `--manual` (interactive chapter selection)
- `--summary`
- `--force`
