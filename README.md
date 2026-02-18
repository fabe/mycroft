# mycroft

Command-line tool that ingests EPUB files, builds a local searchable index, and answers questions using a retrieval-augmented workflow.

## Requirements

- Node.js >= 18

## Install

```bash
npm install -g @fs/mycroft
```

Ensure `node` is on your PATH (the CLI uses Node.js as its runtime).

## Usage

Run `mycroft config onboard` first to set everything up, then use the book and chat commands.

```bash
mycroft book list
mycroft book ingest /path/to/book.epub
mycroft book ingest /path/to/book.epub --summary
mycroft book ingest /path/to/book.epub --batch
mycroft book ingest /path/to/book.epub --batch --summary
mycroft book ingest status <id>
mycroft book ingest resume <id>
mycroft book ask <id> "What is the main conflict?"
mycroft chat start <id>
mycroft chat ask <session> "What does this foreshadow?"
mycroft chat repl <session>
mycroft config init
mycroft config resolve
mycroft config onboard
```

## Cost estimates (approximate)

These are rough, model-dependent estimates for embeddings + optional summaries. Costs vary by model pricing and book structure. Use this as a directional guide only. Summarization estimates assume `gpt-5-nano` and embeddings assume `text-embedding-3-small`.

| Book size | Example | No summaries | With summaries | With summaries (batched) |
| --- | --- | --- | --- | --- |
| Small | 200-300 pages | ~$0.002-$0.004 | ~$0.04-$0.08 | ~$0.02-$0.04 |
| Average novel | 350-450 pages | ~$0.004-$0.006 | ~$0.08-$0.15 | ~$0.04-$0.08 |
| Large novel | 600-800 pages | ~$0.007-$0.01 | ~$0.15-$0.25 | ~$0.08-$0.13 |
| Trilogy | 1,500-2,000 pages | ~$0.02-$0.03 | ~$0.30-$0.60 | ~$0.15-$0.30 |

Reference point: a ~700 page book (~1,600 chunks) is about ~$0.008 for embeddings only, ~$0.20 with summaries, or ~$0.10 with summaries batched.

Use `--summary` to generate per-chapter summaries during ingestion. Summaries improve retrieval quality but are significantly more expensive than embeddings alone (see cost table above). Without `--summary`, ingestion only generates embeddings, which is fast and cheap.

Use `--batch` to cut costs by 50% via the OpenAI Batch API. This applies to both embeddings and summaries. Batch jobs may take up to 24 hours to complete. When using `--batch`, the command returns immediately after submitting the job. When combined with `--summary`, the summary batch runs first; once complete, run `resume` to submit the embedding batch. Use `mycroft book ingest status <id>` to check progress, and `mycroft book ingest resume <id>` to advance to the next phase. If a non-batch ingest is interrupted, use the same resume command to continue without re-embedding completed chunks.

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
- `--batch`
- `--summary`
- `--force`
