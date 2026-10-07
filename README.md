# Lease Search — a retrieval experiment on a homogeneous legal corpus

29 commercial lease agreements, 1299 chunks, three retrieval modes over the
same index: dense, BM25, and their fusion via RRF.

This is not a "chat with your PDFs" project. There is deliberately **no LLM
answer generation** — the output is the original contract fragments. Removing
generation isolates retrieval, which is the part that actually fails on this
kind of corpus and the part that is hardest to see once an LLM paraphrases
over it.

The question the project asks:

> What happens to retrieval when every document in the corpus is the same
> kind of document — same structure, same clauses, same vocabulary — and they
> differ only in numbers and party names?

That describes most real legal, insurance and procurement archives.

---

## Findings

### 1. Self-retrieval failure

A chunk does not retrieve itself when queried with its own text.

Querying the dense index with the **verbatim text** of the gold paragraph
(lease_427, s1p91 — the Tenant non-monetary default clause) put the gold chunk
**second**. First place went to a different lease.

```
   1. 0.783  lease_805  s1p472–s1p481
 ★ 2. 0.780  lease_427  s1p90–s1p92     ← the exact text that was queried
   3. 0.775  lease_805  s1p467–s1p471
   4. 0.774  lease_362  s1p224–s1p232
   5. 0.773  lease_2    s1p883–s1p893
```

The spread across the top 5 is **0.01**. At that resolution, ranking is
decided by noise, not relevance. Default clauses in all leases are
semantically near-identical, so a bi-encoder collapses them into roughly one
point in embedding space.

The verbatim query is a controlled experiment: it removes "how the question
was phrased" as a variable. If the exact text does not win, a natural-language
question will not either — and the original question
(*"How many days does Zomedica have to cure a non-monetary default?"*)
did not bring the gold file into the top 5 at all (scores 0.460 → 0.446).

**Implication:** swapping the embedding model is unlikely to fix this. The
limit is architectural — a bi-encoder encodes the chunk without seeing the
query. Discriminating between near-identical clauses needs lexical signal, a
cross-encoder, or narrowing the search space.

> `text-embedding-3-small` is symmetric (no `query:` / `passage:` prefixes),
> so the flat score distribution is not an artefact of mismatched prefixes.

### 2. The entity is absent from the document body

Users ask by company name. Contracts are written as "Tenant" and "Landlord".

In lease_427 the word *Zomedica* appears only in the Lease Summary, the
signature block and exhibit footers. BM25 for the single-word query
`Zomedica` returns **2 chunks out of 1299** — the header and the exhibits.
The ~100 chunks containing the actual contract terms have no token that ties
them to the tenant.

So a query that names the party carries no usable signal for either retrieval
channel in the body of the contract.

### 3. Hybrid search does not fix a shared blind spot

| # | Question (gold)                                   | Distinguishing token in the chunk? | BM25 | Hybrid |
| - | ------------------------------------------------- | ---------------------------------- | ---- | ------ |
| 1 | Zomedica non-monetary cure period (s1p91)          | no — only the tenant name          | ✗    | ✗      |
| 2 | Zomedica smoking distance (s1p159)                 | yes — `smoke`, `50 feet`           | 2    | 4      |
| 3 | Reata alteration cost threshold (s1p257)           | no — only the tenant name          | ✗    | ✗      |
| 4 | Suite 110 Renovation Allowance (s1p1125)           | yes — `Suite 110`                  | 1    | 1      |
| 5 | Reata Early Termination Option (s1p691)            | yes — `Early Termination Option`   | 1    | 1      |

`hit@5` = **0.60 for both** BM25 and hybrid.

The pattern is the finding. Every question passes when a distinguishing term
physically exists in the chunk, and fails when the only distinguisher is the
party name. Hybrid helps when channels fail *differently*; here both fail for
the same reason — the token is not in the indexed text — so fusion adds
nothing.

Question 3 was built as a hard negative against a near-identical question
about the $25,000 Permitted Alteration threshold in a different lease. It
failed as intended.

### 4. Hub chunks

Paragraph-count chunking produced chunks ranging from a few paragraphs to
30+. Long chunks average many topics, drift towards the corpus centroid and
become "somewhat similar" to everything.

`lease_805 s1p472–s1p481` (10 paragraphs) appeared in the top 5 for both the
natural question and the verbatim query. `lease_427 s1p112–s1p141`
(30 paragraphs: signatures plus three exhibits) outranks focused chunks on
tenant-name queries purely because it contains six footers with the name.

### 5. RRF discards score magnitude

Hybrid scores come out as `0.032 / 0.032 / 0.031 / 0.030 / 0.016`. That is
arithmetic, not relevance: `1/(60+1) × 2 ≈ 0.0328` for a result present in
both lists, `≈ 0.0164` for one list. Any score-spread diagnostic has to be
computed on each channel **before** fusion.

---

## Evaluation method

- **Metrics are split.** `file@5` (did the right contract appear at all) is
  logged separately from `chunk@1` (was the right paragraph first). Low
  `file@5` points at document discrimination — names, lexical signal,
  metadata. High `file@5` with low `chunk@1` points at chunking and reranking.
  A single `hit@5` hides which layer is failing: the verbatim run above would
  have scored ✅.
- **Top-5 score spread** is logged per channel as a resolution indicator.
- **Cross-document contamination** — the share of queries whose top 5 mixes
  chunks from different contracts — is tracked as a proxy for generation risk.
  With 45, 30 and 10 days in the same context window, an LLM will answer
  confidently from the wrong contract.

### Known limitations of the eval set

- Both sets are small — 5 questions behind Finding 3, 6 in
  `lib/test/eval.ts` (see [Eval](#eval)) — and were drafted against two of the
  29 leases. Uniqueness of each fact across the full corpus is not guaranteed
  and should be checked mechanically (`grep` for `forty-five (45)`,
  `$25,000.00`, etc.) before adding questions.
- The Finding 3 questions are not yet in `eval.ts`; its 0.60 is from the
  original manual runs and is not reproducible with `npm run eval` until they
  are added.
- Facts that legitimately change across amendments were excluded on purpose.
  lease_652 alone has five values of Tenant's Proportionate Share
  (11.52% → 16.86% → 29.48% → 30.47% → 32.69%). "Current value" ≠ "first
  value found", and metadata filtering does not help with collisions inside a
  single document.

---

## Next experiment: contextual chunk headers

Hypothesis, not yet measured. Each chunk gets two fields:

- `text` — original fragment, returned to the user
- `embedText` — header + fragment, used for both BM25 and embeddings

```
Zomedica Pharmaceuticals, Inc. (Tenant) | Wickfield Phoenix LLC (Landlord) | Suite 190, Ann Arbor MI
Section 17. Landlord's Remedies
---
b. If Tenant shall be in default in performing any of the terms...
```

The first line is parsed once per document from the Lease Summary / Reference
Pages; the second is the nearest preceding section heading. No LLM
involvement. Header kept to ~20–40 tokens so it does not dilute short chunks.

Expected effect: the party name becomes a token in every chunk of its
contract, which should move questions 1 and 3 and make the hybrid channel
earn its place. Success criteria: `Zomedica` returns ~100 lease_427 chunks
instead of 2; `file@5` rises; top-5 spread on the dense channel widens.

After that, in order: token-based chunking with overlap (removes hubs),
metadata pre-filter when a party is named, cross-encoder reranking on the
top 20.

---

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

| Mode   | What it does                        | OpenAI calls  |
| ------ | ----------------------------------- | ------------- |
| dense  | cosine similarity over embeddings   | 1 per request |
| bm25   | lexical search (wink-bm25)          | none          |
| hybrid | dense + BM25, fused via RRF (k=60)  | 1 per request |

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
npm run data:embed   # chunks.json → embeddings.json (overwrites 21 MB)
```

Both scripts write atomically (temp file + rename), so an interruption won't
leave a corrupted index. Run from the repository root.

## Checks

```bash
npm run typecheck
npm run lint
npm run eval         # hit@1 / hit@5 / MRR for all three modes, read-only
```

## Eval

`npm run eval` runs the questions in `lib/test/eval.ts` (each with a gold
paragraph id) through all three modes and reports where the chunk containing
the gold paragraph landed. This is a chunk-level hit: `hit@k` here is closer
to `chunk@k` than to `file@5` from the evaluation method above.

The set is **different from the five questions behind Finding 3**. Those were
built so that the only distinguisher is the party name, and both channels
score 0.60 on them. The six questions below each contain a distinguishing
term (`Holdover Rate`, `Suite 190`, `Proportionate Share`…), which is why BM25
does so much better here. Current numbers, 6 questions over 2 leases:

| Mode   | hit@1 | hit@5 | MRR  |
| ------ | ----- | ----- | ---- |
| dense  | 0.33  | 0.50  | 0.38 |
| bm25   | 0.50  | 1.00  | 0.68 |
| hybrid | 0.50  | 0.83  | 0.59 |

Dense misses three questions whose answers hinge on defined terms (Holdover
Rate, Permitted Alteration, Construction Allowance); RRF then pulls those
misses into hybrid. The sample is small — treat the table as a baseline for
comparing changes, not as a benchmark.

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
