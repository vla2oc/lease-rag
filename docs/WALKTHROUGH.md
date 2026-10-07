# File-by-file project walkthrough — a study pass

**Date:** September 21, 2026
**Purpose:** go through every file along the data flow, tie it to your
findings from Notion ("RAG findings — Recruo, 10.08") and fill in the
checkboxes that can be answered straight from the data, without running OpenAI.

> **Status (October 7, 2026):** dated snapshot. §0.3, §6.1, §7 and §9.1
> describe `lib/test/eval.ts` as it was before commit `4cbf14b`; it now holds
> six questions and computes hit@1 / hit@5 / MRR for all three modes (see
> README → Eval).

What "before/after" means: git has a single commit (`b3eb0d6`), a diff against
the old version is impossible. The only record of how things used to be is
`docs/CHANGES.md`. Everywhere below, a "was → became" comparison is marked
*(per CHANGES.md)*. The old `/api/chat` survives nowhere; the scratchpad backup
did not outlive the session.

---

## 0. Three things the data says differently from Notion

This is the most important part of the document. The rest is a reference.

### 0.1 The rent table header is not "torn between chunks" — it is not in the index at all

Notion, Finding 1: *"Fixed-size chunking tore them apart between chunks"*.

Measurement on `lease_427`:

| Paragraph | Text | Length | Fate |
| --- | --- | --- | --- |
| s1p22 | `L. Base Annual Rent: … as follows: $801,972.57` | 201 | in chunk #0 |
| **s1p23** | `Term $/SQ.FT Monthly Annually` | **29** | **dropped** |
| s1p24 | `7,888` | 5 | dropped |
| s1p25 | `(1) Months 0-2 $0.00 $0.00 $0.00` | 32 | dropped |
| s1p26 | `(1) Months 3-14 $19.15 $12,587.93 $151,055.20` | 45 | in chunk #0 |
| **s1p27** | `(2) Months 15-26 $19.72 $12,965.57 $155,586.86` | 46 | **in chunk #0** |
| s1p28–s1p30 | rows 3–5 | 46 | in chunk #0 |
| **s1p31** | `TOTAL BASE RENT $801,972.57` | **27** | **dropped** |

`grep 'SQ.FT Monthly Annually' chunks.json` → **0**. `grep 'TOTAL BASE RENT'`
→ **0**. The header is unreachable for dense, for BM25, and for any reranker —
it was thrown away by `MIN_PARAGRAPH_CHARS = 40` in `parse.ts:16`.

And now the main point: **this filter is precisely the "fix" from Finding 2**
("filter out paragraphs shorter than ~40 characters"). Finding 2 broke
Finding 1. Both facts come from the same corpus, from the same line of code.

What the model sees in chunk #0 as a result:

```
…monthly installments as follows: $801,972.57
(1) Months 3-14 $19.15 $12,587.93 $151,055.20
(2) Months 15-26 $19.72 $12,965.57 $155,586.86
…
```

The total for the whole term sits right before the rows, and the column names
are gone. Your prediction from Notion ("the model will confidently return the
annual figure instead of the monthly one") becomes even more plausible.

**What this means for debugging.** In Notion you have three branches:
retrieval didn't find it / the model ignored the context / the document isn't
in the database. Here is a fourth: **retrieval found the right chunk (BM25 puts
it in 1st place, see 0.3), but the chunk physically does not contain the needed
information — parsing lost it**. `hit@5 = 1`, yet the question cannot be
answered. This is the case where the retrieval metric says "all good" and lies.

### 0.2 Five of the six gold paragraphs of lease_427 sit in a single chunk

From your table of candidate eval questions plus s1p33 from `evalSet`:

| Question | Gold | Where it lives |
| --- | --- | --- |
| When does this lease end? | s1p21 | chunk #0 (s1p3–s1p33) |
| Who is the landlord? | s1p5 | chunk #0 |
| How many square feet? | s1p16 | chunk #0 |
| Monthly rent in month 20? | s1p27 | chunk #0 |
| Tenant's Proportionate Share | s1p33 | chunk #0 |
| Late payment penalty | s1p57 | chunk #4 (s1p55–s1p60) |

The LEASE SUMMARY section fits entirely into the contract's first chunk. Any
question that mentions "Zomedica" or "Wickfield" will be led by BM25 to
chunk #0 — and hit@5 will be close to 100% even though such an eval has no
discriminating power. If you build the eval set from LEASE SUMMARY (as you
planned), this has to be accounted for: either take questions from the body of
the contract (you already have s1p54, s1p91, s1p159 — they are in different
chunks), or compute hit@1 / MRR instead of hit@5.

### 0.3 The eval in the repository computes nothing

`lib/test/eval.ts` right now:

- one "question", and it is not a question but the string `"WICKFIELD PHOENIX,
  LLC, a Michigan limited liability company"` — the landlord's name verbatim;
- `goldId: "s1p112"` — chunk #16, BM25 finds it trivially;
- `answer: "45 days …"` — copied from a different question (about the cure
  period, gold s1p91, chunk #12);
- the fields `goldId`, `file`, `answer` **are not read anywhere**. There is no
  hit@5 loop.

In Notion you have 11 proper questions with gold IDs. In the code — zero. All
the "hit@5 before/after, precision@5, MRR" checkboxes are currently unfillable
not because you didn't run it, but because there is nothing to compute them
with.

Groundedness / citation accuracy are unfillable **by construction**: `/api/chat`
is cut out, the response generates nothing. That is not a failure — it is a
scope fact you need to be able to say out loud: "in this version I measured
retrieval only; generation was moved out of the MVP scope".

A BM25 check (no network needed) for the question from Finding 1:

```
Q: What is the monthly rent in month 20?
  1. 10.005  lease_427  s1p3–s1p33   <-- gold s1p27
  2.  9.901  lease_805  s1p864–s1p873
  3.  8.814  lease_contract_19  s1p482–s1p492
```

Retrieval hit. The question cannot be answered from this chunk (see 0.1).

---

## 1. Data flow

```
lib/data/pool/*.html   29 contracts, <p id="sNpM">
        │  parse.ts     (cheerio, ≥40-char filter, chunks ~2000)
        ▼
lib/data/embed/chunks.json      1299 chunks, 3.4 MB
        │  embed.ts     (text-embedding-3-small, 768 dim, batches of 300)
        ▼
lib/data/embed/embeddings.json  the same 1299 + vector, 21 MB
        │  store.ts     (getIndex — one parse per process)
        ├──► search.ts   dense: cosine over all 1299
        ├──► bm25.ts     lexical: wink-bm25, engine built lazily
        └──► hybrid.ts   RRF(dense top-20, bm25 top-20), k=60
                 │
        app/api/search/route.ts   validation, rate limit, three modes
                 │
        app/page.tsx              form, mode switch, cards
```

Below — file by file in this order. Each has three parts: **what it does →
what was yours, what changed → what to say about it in an interview**.

---

## 2. Data and indexing

### 2.1 `lib/data/pool/*.html` — the corpus

**What it is.** 29 ALeaseBERT files in the format `<p id="s1p23">…</p>`. Names
like `a.doaHDzg8N…-lease_427.plain.html` — the prefix before the hyphen is the
id from the dataset storage, after the hyphen is the human-readable name.

**Yours.** You selected them out of 335 via `grep -il landlord` (Notion,
Finding 3).

Checked: `lease_972` (Uxin, share subscription agreement) is **not** in the
pool — the triage cut it out. So Finding 3 is not merely an observation but an
action with a result: "found garbage in a dataset assembled by keyword, and
cleaned it out with my own keyword filter, but by content rather than by file
name".

**In an interview.** An example for the question "vector vs keyword — when does
each fail": the file is called lease because the word LEASE appears in a party's
name. Keyword on the file name misses; keyword on the body
(landlord/tenant/premises) works. Vector search would have cut such a document
out even more confidently, because semantically it is about shares, not leasing.

### 2.2 `lib/data/parse.ts` — HTML → chunks

**What it does.**

1. Reads all `.html` files from `lib/data/pool`.
2. For each `<p>` takes `id` and `text().trim()`.
3. Drops paragraphs without an `id` and those shorter than 40 characters.
4. `makeChunks`: accumulates paragraphs in a buffer until the sum of lengths
   reaches 2000 — then flushes the buffer into a chunk. A chunk = `{ text,
   paragraphIds, file }`, the text is paragraphs joined with `\n`.
5. Writes `chunks.json` atomically.

**Yours / changed** *(per CHANGES.md §5.5, §5.6, §10)*.

- **Yours, kept:** size 2000, threshold 40, the buffer algorithm, joining
  with `\n`. The chunking logic is untouched.
- **Changed:** paths are anchored to `process.cwd()` (previously `./pool` and
  `data/chunks.json` relative to the current directory — did not work from the
  root); writing via `writeJsonAtomic`; a `p.id !== undefined` guard added
  (the typical TS2345 error).
- The `id` guard **drops nothing** in this corpus: all 16,185 paragraphs have
  an id. It is needed for the type, not for the data.

**What the 40-character filter actually does.** Of 16,185 paragraphs,
**6,957 (43%)** are dropped. Among them:

- 2,789 — single tokens (`)`, `1`, `3`, `By:`, page numbers) — pure garbage,
  the filter works as intended;
- 5 — running headers `Exhibit to …` (Notion estimated "~10"; by exact prefix
  I counted 5);
- **20 — lines with a dollar amount** (like s1p25, s1p31) — data loss;
- plus table headers like s1p23, which fall into none of these categories but
  are exactly what makes the rows meaningful.

A length filter is a blunt instrument: it does not distinguish a "page number"
from a "column header". Both are short.

**On chunk size.** `size >= MAX_CHARS` is checked **after** `push`, so a chunk
is flushed once it has already gone past 2000. Measurement:

```
chunks: 1299   chars min/p50/p90/max: 238 / 2214 / 2924 / 6372
above 2000: 1271 of 1299     above 3000: 118
single-paragraph chunks: 35 (e.g. #3 — s1p54, 2244 chars)
```

`MAX_CHARS` is not a maximum but a "threshold after which we flush". The actual
median chunk is 2214. There is **no** overlap between chunks.

**In an interview.**

- "Chunk size and overlap?" → "~2000–2200 characters, aligned to paragraph
  boundaries, no overlap. This is deliberately crude: a baseline to measure
  structural chunking against".
- "What breaks with fixed-size chunks?" → see §0.1. Not "splits at an
  unfortunate spot", but concretely: the table header is shorter than the
  threshold and disappears from the index, the rows with amounts are left
  without column names, the model confidently confuses monthly and annual.

### 2.3 `lib/data/atomic.ts` — safe writes

**What it does.** `writeJsonAtomic(path, data)`: writes to a temporary file
next to the target (`…json.tmp-<pid>`), then `renameSync`. Within a single
file system `rename` is atomic — on disk there is either the old file in full
or the new file in full. On error the temporary file is removed and the
exception propagates. `readJson` is a read wrapper relative to `process.cwd()`.

**Yours / changed** *(CHANGES.md §5.3)*. The file is new. Previously
`writeFileSync` directly — it first truncates the file to zero, then writes.
`Ctrl+C` in the middle of writing 21 MB = a corrupt index, and git was not
initialized back then.

**In an interview.** This is the answer to "how do you protect pipeline
artifacts". Not "I make backups", but "the write is atomic by construction:
temp + rename".

### 2.4 `lib/data/embed.ts` — chunks → vectors

**What it does.** Reads `chunks.json`, pushes the text in batches of 300 into
`text-embedding-3-small` with `dimensions: 768`, joins the vectors to the
chunks **by array index**, writes `embeddings.json`.

**Yours / changed** *(CHANGES.md §5.2, §5.4, §6.2)*.

- **Yours, kept:** the model, 768 dimensions, batch of 300, joining by index.
- **Changed:** the write path (previously `app/api/docs/data/embeddings.json` —
  the directory did not exist, the script crashed with ENOENT *after* it had
  spent money on embeddings); `embeddingModel` instead of the deprecated
  `textEmbeddingModel`; an `all.length !== chunks.length` check before
  writing; per-batch progress.

**Why the length check matters.** If the provider returns one vector fewer on
a single batch, every subsequent chunk gets its neighbor's vector. There will
be no error. Search will start returning text that does not match the vector —
silently. This is the worst class of breakage in RAG: the index "works", the
metrics drift, the cause is invisible.

**In an interview.** "Why 768 and not 1536?" → Matryoshka truncation in
`text-embedding-3-small`: half the index size at a small quality loss; for 1299
chunks that is 21 MB instead of ~42. "How do you know the index isn't
corrupted?" → the length invariant is checked before writing, the write is
atomic.

### 2.5 `lib/data/embed/chunks.json`, `embeddings.json` — the index itself

Rebuild order: `data:parse` → `data:embed`, always as a pair — otherwise the
index goes out of sync (see above). Both files **are in git** deliberately: see
`.gitignore` and `next.config.ts` below.

---

## 3. Retrieval

### 3.1 `lib/api/store.ts` — the single access point to the index

**What it does.**

- Types `Chunk` (with the vector) and `Hit = Omit<Chunk, "embedding"> & { score }`.
- `getIndex()` — reads `embeddings.json` once per process (`cached ??=`),
  lazily, on first access.
- `docLabel(file)` — `a.doaHDzg8N…-lease_427.plain.html` → `lease_427`.
- `toHit(chunk, score)` — an **explicit** list of fields: `text`,
  `paragraphIds`, `file`, `score`. Not a spread.

**Yours / changed** *(CHANGES.md §3, §4.1)*. The file is new. Previously
`search.ts` and `bm25.ts` each did their own `readFileSync` at module level —
21 MB parsed twice, two copies in memory. And `search()` returned
`{ ...chunk, score }` — with the vector inside: 16.4 KB per result instead of
2.3 KB, 70 KB of excess for five hits.

**In an interview.** "Whitelist, not blacklist": if a field is added to
`Chunk`, it will not leak into the API response automatically. This is a
general principle for any DTO, not just for RAG.

### 3.2 `lib/api/cosine.ts` — cosine similarity

**What it does.** `dot / (|a|·|b|)` in a single pass over 768 elements.

**Yours.** Not changed by a single character *(CHANGES.md §10)*.

**In an interview.** One nuance that will be asked: OpenAI embeddings are
already normalized, so cosine = dot product, and the norms could be skipped.
Here they are computed — that is ~2× extra work over 1299 × 768, irrelevant for
a demo, but for 1M vectors it is already an argument for normalizing at index
time.

### 3.3 `lib/api/search.ts` — dense

**What it does.**

1. Embeds the query with the same model and dimensionality as the index (this
   is mandatory — otherwise vectors from different spaces are compared).
2. Computes cosine against all 1299 chunks → an array of `{ i, score }`.
3. Sorts, cuts to `k`, and only then turns the `k` items into `Hit`.

**Yours / changed** *(CHANGES.md §4.3)*. The formula is the same. Previously
`indexed.map(chunk => ({ ...chunk, score }))` — 1299 full copies with vectors,
only to throw away all but five. Now 1299 pairs of numbers and 5 copies.

**In an interview.** This is brute-force kNN: O(N·d). For 1299 chunks — ~1M
multiplications, fractions of a millisecond. "When would you switch to a vector
DB?" → when N·d stops fitting into the latency budget or the process memory
(21 MB of JSON is parsed on every cold start — see CHANGES.md §12.4).

### 3.4 `lib/api/bm25.ts` — lexical

**What it does.** `wink-bm25-text-search` with a preparation pipeline:
`lowerCase → removeExtraSpaces → tokenize0 → removeWords (stop words) →
stem`. Each chunk is added as a document with id = index in the array;
`consolidate()` builds the inverted index. `search(query)` returns
`[docId, score]` pairs in descending order.

**Yours / changed** *(CHANGES.md §4.2)*. The config and the pipeline are yours.
Changed: the engine is built lazily in `getEngine()` on the first BM25 query
rather than at module import (previously a dense query paid for stemming 1299
documents it did not need). Types come from `types/wink.d.ts`.

**In an interview.**

- Why BM25 found chunk #0 for "monthly rent in month 20": `monthly`, `rent`,
  `month` match the text after stemming; `20` does not, but it doesn't need to.
- The BM25 score is not normalized (here 8–15), it depends on document length
  and corpus IDF. It cannot be compared directly with cosine — hence RRF.
- Stop words and stemming are English. For a Russian corpus the pipeline would
  have to change.

### 3.5 `lib/api/hybrid.ts` — RRF

**What it does.**

```
dense  = search(q, 20)        // top-20 by cosine
sparse = bm25Search(q, 20)    // top-20 by BM25
score(chunk) = Σ over the lists where the chunk appears:  1 / (60 + rank + 1)
```

The deduplication key is `file + paragraphIds[0]`. The result is sorted by the
sum and cut to `k`.

**Yours / changed** *(CHANGES.md §6.1, §10)*. The formula, `k = 60`, depth 20 —
all yours. Only the typing changed (`any` → `Hit`) and a redundant `await` was
removed.

**RRF score range.** A chunk in 1st place in both lists: `2/61 ≈ 0.033`. In only
one list at 20th: `1/80 = 0.0125`. This is a third scale, unrelated to either
cosine (0–1) or BM25 (8–15). In the UI all three are printed via `toFixed(3)`
with no label saying which scale it is — nobody will ask in an interview, but
if you show the screen, it is worth knowing.

**In an interview.**

- "Why RRF and not weighted sum?" → because the scales are incommensurable. RRF
  uses only ranks; it does not care that cosine is 0.8 and BM25 is 12.
- "Why k=60?" → the value from the original paper (Cormack et al., 2009); a
  large k smooths the difference between 1st and 5th place, a small one
  amplifies the top of the list. 60 is the standard default, not tuned.
- "When does hybrid lose to one of the modes?" → when one list brings garbage
  into its top-20, it still gets `1/(60+rank+1)` and can push out a good result
  that exists only in the other list.

---

## 4. HTTP layer

### 4.1 `lib/api/rate-limit.ts` — sliding window

**What it does.** `Map<ip, timestamps[]>`. On each request it filters out
timestamps older than 60 s; if ≥ 20 remain — refuses with `retryAfter` until
the oldest expires. Above 5000 keys it purges stale ones. The key is the first
address from `x-forwarded-for`, otherwise `"unknown"`.

**Yours / changed** *(CHANGES.md §2.2)*. The file is new. Previously there was
no limit — a deployed route would have been an open proxy to your key.

**A nuance for local development.** Without a proxy there is no
`x-forwarded-for` header, so all requests land in the single `"unknown"`
bucket. That is, on localhost the 20/min limit is shared by everyone. For dev
that is fine, but if you run the eval over HTTP — you will hit it.

**In an interview.** "An in-memory counter — so on serverless the limit is 20 ×
the number of instances. Enough for an MVP; the `rateLimit(key)` interface
swaps for Upstash with no changes to the route".

### 4.2 `app/api/search/route.ts` — the endpoint

**What it does.** The order of checks matters and is deliberate:

1. **Rate limit — first**, before reading the body. A refusal must be cheap.
2. JSON is parsed inside `try/catch` → 400, not a 500 with a stack trace.
3. The body is an object; `query` is a string, `trim`, 1–300 characters;
   `mode` ∈ {dense, bm25, hybrid}; `k` is an integer 1–10.
4. Search inside `try/catch`: details go to `console.error`, outward
   `500 { error: "Search failed" }`.
5. The response is `{ mode, results: [{ doc, paragraphIds, score, text }] }`.
   `file` → `doc` via `docLabel`.

`export const runtime = "nodejs"` — the route uses `fs` and holds 21 MB in
memory; this does not work on Edge.

**Yours / changed** *(CHANGES.md §1, §2, §3.2, §8.3)*. The file is new, it
replaced `/api/chat`. Per CHANGES.md the old route: `const { question } = await
req.json()` with no checks, fragments glued into the prompt with no delimiters,
`generateText` with `gpt-4.1`.

**In an interview.**

- The 300-character limit is both validation and a cost ceiling: a longer query
  physically cannot be sent to the embedder.
- Prompt injection went away not because it was fixed, but because contract
  text no longer reaches any model. If generation comes back, the problem comes
  back with it: you need context delimiters and an explicit ban on executing
  instructions found in documents.

---

## 5. First screen

### 5.1 `app/page.tsx`

**What it does.** A client component: an input (`maxLength={300}` mirrors the
server), a radio group of modes inside a `<fieldset>` with an `sr-only` legend
(keyboard- and screen-reader-accessible, visually a segmented switch), a hint
below it, loading / error / empty-result states, cards with `doc`, the
paragraph range, score and text (`line-clamp-6`).

**Yours / changed** *(CHANGES.md §7)*. It was `return <></>`. Everything is new.

**In an interview.** This is `eval.ts` turned into a screen: you can see where
dense beats BM25 and what fusion adds. The card key is
`${doc}-${paragraphIds[0]}`, the same as in RRF — unique as long as chunks do
not overlap.

### 5.2 `app/layout.tsx`, `app/globals.css`

The Geist font via `next/font`, metadata instead of the `create-next-app`
placeholders, dark theme via `prefers-color-scheme`. Per CHANGES.md §7.1–7.3:
previously `body { font-family: Arial }` overrode the loaded Geist, and there
was no dark theme.

---

## 6. Scripts and configuration

### 6.1 `lib/test/eval.ts`

**What it does now.** Prints the top-5 in three modes for a single query. That's
all. See §0.3 — it computes no metrics and reads no gold fields.

**What it was** *(CHANGES.md §10)*: "four questions and the hit@5 counting loop
were left commented out as they were". **The current file has none of this.**
CHANGES.md is stale here relative to the working tree — somewhere between
August 10 and the September 21 commit the commented-out block disappeared.

**What is needed to fill in Notion.** Move the 11 questions from Notion into
`evalSet`, run three modes for each, check
`hits.some(h => docLabel(h.file) === q.file && h.paragraphIds.includes(q.goldId))`,
compute hit@1, hit@5, MRR. That is ~30 lines. Dense/hybrid will need the key
(11 questions × 2 modes ≈ $0.00001).

### 6.2 `lib/test/lens.ts`

Prints the min/max number of paragraphs in a chunk. Diagnostics, moved to
`getIndex()`. Currently: min 1, max 38 — that is, a single chunk can be one
paragraph of 6,372 characters or 38 paragraphs of ~55 each.

### 6.3 `types/wink.d.ts`

Ambient declarations for the two wink packages that have no types and no
`@types`. Only what is actually called in `bm25.ts` is described. Without this
`tsc` gave TS7016 and `next build` failed.

### 6.4 `next.config.ts`

`outputFileTracingIncludes: { "/api/search": ["./lib/data/embed/embeddings.json"] }`.

The most treacherous spot in the project *(CHANGES.md §8.1)*: the index is read
via `fs`, Next's static analysis does not see it and does not put it into the
serverless bundle. Works locally, on Vercel — a 500 on the first request. The
route key must match exactly — a typo is silently ignored.

### 6.5 `.gitignore`

A warning comment: do **not** add `lib/data/embed/*.json`. 21 MB of JSON in the
repository looks like garbage, but without it production breaks while locally
everything keeps working.

### 6.6 `tsconfig.json`

`allowImportingTsExtensions: true` — imports with `.ts` are needed so the
scripts run under bare `node` (native type stripping in modern Node). Requires
`noEmit: true`.

### 6.7 `package.json`

| Script | What |
| --- | --- |
| `typecheck` | `next typegen && tsc --noEmit` |
| `data:parse` | HTML → `chunks.json` |
| `data:embed` | `chunks.json` → `embeddings.json`, with `--env-file=.env` |
| `eval` | three modes under bare `node`, with `--env-file=.env` |

Bare `node` does not read `.env` — hence `--env-file`. Next loads `.env` on its
own, so in `next dev` this goes unnoticed.

A minor thing: running `.ts` under `node` emits a
`MODULE_TYPELESS_PACKAGE_JSON` warning — there is no `"type": "module"` in
`package.json`. It works, but re-parses as ESM every time. One line, if it gets
annoying.

`@ai-sdk/google` is in the dependencies and is used nowhere.

---

## 7. Notion ↔ code: what can be filled in right now

| Checkbox in Notion | Answer from the data |
| --- | --- |
| Did s1p23 land in the same chunk as s1p27 | **No. s1p23 did not land in any chunk** — dropped by the 40-character filter (`parse.ts:16`). s1p27 is in chunk #0 (s1p3–s1p33). |
| What retrieval (BM25) fetched | chunk #0 in 1st place, score 10.005 — there is a hit, but the header is not in the chunk |
| How many paragraphs were thrown away (Finding 2) | 6,957 of 16,185 (43%). Among them 2,789 single tokens, 5 running headers `Exhibit to…`, **20 lines with $ amounts** |
| hit@5 before/after, precision@5, MRR | nothing to compute with — `eval.ts` has no metrics loop (see §6.1) |
| groundedness, citation accuracy | nothing to compute with by construction — there is no generation |
| Finding 3, lease_972 | absent from the pool — the triage cut it out |

What to correct in Notion itself when you edit it:

- Finding 1: not "tore apart between chunks", but "the header and the total are
  shorter than the threshold and did not make it into the index; the rows with
  amounts were left without column names".
- Finding 2: the filter works (43% garbage), but with a side effect — table
  headers and short money lines. Findings 1 and 2 are one story from two sides.
- On the eval from LEASE SUMMARY: 5 of the 6 gold paragraphs of lease_427 are in
  one chunk — hit@5 on such a set distinguishes nothing.

---

## 8. Where CHANGES.md diverged from the working tree

Not errors, just that the document was written on August 10 and the commit is
from September 21.

- §5.3 "Git is not initialized in the project" — now initialized, one commit.
- §10 "the commented-out eval set was left in place" — the current `eval.ts`
  does not have it.
- §12.1 "`git init`" — done. §12.2 (the key on the hosting), §12.3 (shared
  rate limit), §12.4 (vector store) — still open.

---

## 9. What I would do next (not done — deliberately)

Your own principle from Notion: *a breakage can only be recorded at the moment
it exists*. Right now it exists, and §0.1 is its record. I touched nothing in
`parse.ts` and did not rebuild the index.

When you fix it — in this order, so that every step has a number attached:

1. **An eval loop** in `eval.ts` with the 11 questions from Notion: hit@1,
   hit@5, MRR across three modes. This is the baseline. Without it, items 2–3
   are not measurable.
2. **Structural chunking** instead of the length filter: do not throw a short
   paragraph away but glue it to the next long one (table header → to the first
   row; `TOTAL …` → to the previous one). Cut garbage like `)` and page numbers
   by content (a regex for "digits/punctuation only"), not by length. Re-run
   `data:parse` → `data:embed`, take the same metrics.
3. Only then — the **groundedness** question: it requires bringing generation
   back, and with it context delimiters and a ban on executing instructions
   found in documents (CHANGES.md §1.1).

Items 2 and 3 are two different fixes, two different metrics. Exactly what you
yourself wrote in the section "Metrics — where I get confused".
