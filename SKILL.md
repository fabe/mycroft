---
name: mycroft-cli
description: EPUB ingestion, local vector index, and Q&A CLI for books.
homepage: https://github.com/fabe/mycroft-cli
metadata: {"clawdbot":{"emoji":"📚","requires":{"bins":["mycroft"],"env":["OPENAI_API_KEY"]},"install":[{"id":"npm","kind":"npm","package":"@fs/mycroft","bins":["mycroft"],"label":"Install mycroft (npm)"}]}}
---

# mycroft

Use `mycroft` to ingest EPUBs, build a local vector index, and ask questions about a book.

Setup (once)
- `export OPENAI_API_KEY="..."`
- `mycroft config init`
- `mycroft config resolve`

Common commands
- List books: `mycroft book list`
- Ingest EPUB: `mycroft book ingest /path/to/book.epub`
- Ingest with summaries: `mycroft book ingest /path/to/book.epub --summary`
- Show metadata: `mycroft book show <id>`
- Ask a question: `mycroft book ask <id> "What is the main conflict?"`
- Search passages: `mycroft book search <id> "mad hatter" --top-k 5`
- Delete book: `mycroft book delete <id> --force`

Notes
- Use `mycroft config path` to find the config file location.
- `book ask` and `book search` require embeddings and an `OPENAI_API_KEY`.
- Prefer `book search` and synthesize answers yourself before using `book ask`.
- Summaries increase ingestion time and cost significantly; enable `--summary` only when needed.
- For scripted runs, avoid interactive flags like `--manual` or omit confirmations with `--force`.
