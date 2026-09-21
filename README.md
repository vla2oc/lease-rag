# Lease Search

Search over 29 lease agreements (1299 chunks). Three retrieval modes on the
same corpus — dense, BM25, and their fusion via RRF. No LLM answer generation:
the output is the original contract fragments.

## Running

```bash
npm run dev          # http://localhost:3000
```

Requires a `.env` in the project root:

```
OPENAI_API_KEY=sk-...
```

The key is used only to embed the search query (`text-embedding-3-small`,
768 dimensions) — about $0.0000004 per request. BM25 mode never touches the
network.

## Modes

| Mode   | What it does                                  | OpenAI calls  |
| ------ | --------------------------------------------- | ------------- |
| dense  | cosine similarity over embeddings             | 1 per request |
| bm25   | lexical search (wink-bm25)                    | none          |
| hybrid | dense + BM25, fused via RRF (k=60)            | 1 per request |

## API

`POST /api/search`

```json
{ "query": "notice period for early termination", "mode": "hybrid", "k": 5 }
```

- `query` — string, 1–300 characters
- `mode` — `dense` | `bm25` | `hybrid` (default `hybrid`)
- `k` — integer 1–10 (default 5)
- rate limit: 20 requests per minute per IP (in-memory, per instance)

Response: `{ mode, results: [{ doc, paragraphIds, score, text }] }`

## Rebuilding the index

Order matters — vectors are matched to chunks by array index:

```bash
npm run data:parse   # lib/data/pool/*.html → lib/data/embed/chunks.json
npm run data:embed   # chunks.json → embeddings.json (overwrites 22 MB)
```

Both scripts write atomically (temp file + rename), so an interruption won't
leave a corrupted index. Run from the repository root.

## Checks

```bash
npm run typecheck
npm run lint
npm run eval         # top-5 for a reference query in all three modes, read-only
```

## Deployment

1. **The key.** `.env` is not committed, so `OPENAI_API_KEY` must be set in
   the hosting project settings. Without it `dense` and `hybrid` return 500
   while `bm25` keeps working — it looks like a mode bug, not a missing
   variable.
2. **The index must live in the repo.** `lib/data/embed/*.json` is
   deliberately not in `.gitignore`: `embeddings.json` is read via `fs`, not
   imported, and only reaches the bundle through `outputFileTracingIncludes`
   in `next.config.ts`. Verify after building:

   ```bash
   grep -l embeddings.json .next/server/app/api/search/route.js.nft.json
   ```

3. **Post-deploy canary** — `POST /api/search` with `mode: "bm25"`. It
   exercises the index read without spending a single OpenAI call.

A cold start parses 21 MB of JSON, and BM25 additionally builds an index over
1299 documents. Under real traffic this belongs in a vector store.
