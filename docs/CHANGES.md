# From research to MVP — a full breakdown of the changes

**Date:** 10 August 2026
**Task:** build a working first screen, cut out LLM answer generation,
verify security and data integrity, prepare for deployment.

The document follows the pattern **Cause → What was done → Effect**. Sections
are grouped by topic; a per-file index of everything touched is at the end.

---

## 0. Starting point

The project was a retrieval study: three search implementations (dense / BM25 /
hybrid via RRF), a corpus of 29 lease agreements split into 1299 chunks with
768-dimensional embeddings. On top sat a `/api/chat` route that glued the
retrieved fragments into a prompt and handed them to `gpt-4.1`.

There was no frontend: `app/page.tsx` returned `<></>`. Everything was run
manually from the terminal via `lib/test/eval.ts`.

Three facts that defined the scope of work:

| Fact | How it was found |
| --- | --- |
| `tsc --noEmit` produced **24 errors** — the Next build would have failed | `npx tsc --noEmit` |
| The 21 MB index was read and parsed **twice** | reading `search.ts:6` and `bm25.ts:6` |
| `embed.ts` wrote to a directory that does not exist | `find app -type f` — there is no `app/api/docs` directory |

---

## 1. Cutting out generation

### 1.1 The `/api/chat` route was removed

**Cause.** An explicit request: generation is the most expensive part, and the
study was about retrieval, not a wrapper around it. Also, `generateText` with
`gpt-4.1` was the only place where the cost of a request was measured in cents
rather than fractions of a cent.

**What was done.** The `app/api/chat` directory was removed entirely. A copy of
the old file was kept outside the repository (`…/scratchpad/chat-route.ts.bak`)
in case the logic needs to be brought back.

**Effect.**

- Not a single `generateText` call remains in the project.
- As a side effect, the **prompt injection** vector is gone: previously the
  contract text was glued into the prompt with no delimiters and no
  instruction forbidding the model to follow instructions from the context.
  Now document text never reaches any model — there is nowhere for an
  injection to land.
- The unused `embed` import (it was at `route.ts:2`) was removed.
- The ability to "ask a question and get an answer" is gone. This is a
  deliberate trade-off: the MVP shows the retrieved fragments, not a generated
  answer.

### 1.2 Query embedding was kept

**Cause.** Cutting OpenAI calls entirely would have meant throwing away dense
and hybrid — that is, exactly what the study was done for.

**What was done.** `text-embedding-3-small` (768 dimensions) stays in
`lib/api/search.ts` to vectorize the search query.

**Effect.** One request ≈ 20 tokens ≈ **$0.0000004**. A million requests —
less than a dollar. The `bm25` mode never touches the network at all and works
without a key.

---

## 2. Securing the HTTP endpoint

New route: `app/api/search/route.ts`.

### 2.1 Input validation

**Cause.** The old code was a single line: `const { question } = await
req.json()`. That gives three holes:

- invalid JSON → unhandled exception → 500 with a stack trace;
- `question` missing or not a string → passed to the provider as is;
- a one-megabyte string → a token bill, paid by the key owner.

**What was done.** All fields are checked before anything goes to the search:

| Field | Rule | Response on violation |
| --- | --- | --- |
| body | parses as JSON, is an object | 400 |
| `query` | string, 1–300 characters after `trim()` | 400 |
| `mode` | `dense` \| `bm25` \| `hybrid`, default `hybrid` | 400 |
| `k` | integer 1–10, default 5 | 400 |

**Effect.** Tested on nine kinds of bad input — 400 with a clear message
everywhere instead of 500:

```
invalid JSON         → 400 Request body must be valid JSON
query missing        → 400 Field query must be a string
query = 123          → 400 Field query must be a string
query = "   "        → 400 Field query must not be empty
query 301 characters → 400 Query is longer than 300 characters
mode = "gpt4"        → 400 Field mode must be one of: dense,bm25,hybrid
k = 999              → 400 Field k must be an integer from 1 to 10
k = 2.5              → 400 Field k must be an integer from 1 to 10
body = [1,2,3]       → 400 Field query must be a string
```

The 300-character ceiling also bounds the cost: a longer query physically
cannot be sent.

### 2.2 Rate limiting

**Cause.** Without a limit, a deployed endpoint is an open proxy to someone
else's OpenAI key. Even at $0.0000004 per request, a script in a loop creates
unbounded load on the instance.

**What was done.** `lib/api/rate-limit.ts` — a sliding window: **20 requests
per minute** per IP (`x-forwarded-for`, first address in the list). Exceeding
it → 429 with a `Retry-After` header. The `Map` is purged of expired keys when
it crosses 5000 entries, so it does not grow forever.

**Effect.** Verified: the 21st request within a minute gets
`429 Too Many Requests` and `retry-after: 39`.

**A limitation worth knowing.** The counter lives in process memory. On
serverless, every instance has its own copy, so the effective limit is
20 × number of instances. For an MVP that is enough — the goal is to cut off
a script in a loop, not to withstand a DDoS. The interface (`rateLimit(key)`)
is deliberately shaped so that swapping in Upstash / Vercel KV requires no
changes to the route.

### 2.3 Errors without internal details

**Cause.** An unhandled exception in Next sends the stack trace outward, and
it reveals filesystem paths and project structure.

**What was done.** The search is wrapped in `try/catch`: details go to
`console.error`, the client gets `500 { error: "Search failed" }`.

**Effect.** Diagnostics stay in the server logs; nothing about the internals
leaks out.

---

## 3. Leaks in the response body

### 3.1 Vectors no longer go to the client

**Cause.** `search()` returned `{ ...chunk, score }`, and `chunk` contains an
`embedding` field — 768 numbers. The old route was saved only by the fact that
it took just `.text` and `.file` from the result. Any new consumer would have
received the vectors in full.

Measured on real data:

| | Size |
| --- | --- |
| chunk with vector | 16.4 KB |
| chunk without vector | 2.3 KB |
| **excess for 5 results** | **70 KB** |

**What was done.** The `toHit()` function in `lib/api/store.ts` lists the
fields explicitly — `text`, `paragraphIds`, `file`, `score` — instead of a
spread.

**Effect.** The response lost 70 KB. More importantly, the list is now a
*whitelist*, not a blacklist — a new field added to the `Chunk` type will not
leak out automatically. Verified: `'embedding' in results[0]` → `false`.

### 3.2 File names replaced with human-readable ones

**Cause.** The response contained `a.doaHDzg8N.s12EpndLImz58WrW-lease_427.plain.html`
— an internal identifier from the storage. The client does not need it, and
it exposes the naming scheme.

**What was done.** `docLabel()` in `lib/api/store.ts` strips the prefix up to
the first hyphen and the `.plain.html` suffix. Before that, it was verified
that all 29 names contain exactly one hyphen — the trimming will not cut too
much.

**Effect.** What goes out is `lease_427`. The `file` field is removed from the
API response entirely — only `doc` remains in the JSON. Verified:
`'file' in results[0]` → `false`.

---

## 4. Working with the index

### 4.1 One parse instead of two

**Cause.** `search.ts:6` and `bm25.ts:6` independently did
`fs.readFileSync("lib/data/embed/embeddings.json")` **at module level**. The
same 21 MB file was read from disk and parsed twice, and memory ended up with
two independent copies of the array of 1299 chunks with vectors.

**What was done.** `lib/api/store.ts` — a single access point `getIndex()`
with lazy memoization (`cached ??= JSON.parse(...)`).

**Effect.** One parse per process, one copy in memory. The parse is deferred
until first use: importing the module no longer reads anything from disk.

### 4.2 The BM25 index is built lazily

**Cause.** `bm25.ts` called `engine.addDoc()` for each of the 1299 documents
and `engine.consolidate()` right at module import. This work was done even
when the user requested dense only.

**What was done.** The build is moved into `getEngine()`, called on the first
`bm25Search()` invocation.

**Effect.** A cold start in dense mode no longer pays for stemming and
indexing 1299 documents. On the first BM25 query the price is paid once; after
that the engine is reused.

### 4.3 Fewer copies during dense search

**Cause.** The old code did `indexed.map((chunk) => ({ ...chunk, score }))`
— that is, it created 1299 full copies of chunks **together with their
vectors**, only to then sort and discard all but five.

**What was done.** First a lightweight array of `{ i, score }` pairs is
computed, sorted, trimmed to `k`, and only then are the `k` elements turned
into `Hit`.

**Effect.** Instead of 1299 copies of 16.4 KB each — 1299 small objects of two
numbers and 5 final copies.

---

## 5. Safety of writes to disk

This is the section behind the question "will anything be lost?".

### 5.1 What was verified about data integrity

**Cause.** It had to be proven, not assumed, that running the scripts would
not destroy 21 MB of embeddings and 29 source HTML files.

**What was done.** A full search for every write operation across the sources:

```
grep -rnE 'writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|rename|truncate|createWriteStream' lib app --include='*.ts'
```

Exactly three places were found — `parse.ts:59`, `parse.ts:60`, `embed.ts:26`.
None of them is in the import graph of `eval.ts` (`eval → search / bm25 /
hybrid → cosine`, all read-only). Additionally, an `mtime` snapshot of all 39
files in `lib/` was taken before and after the run — not one changed.

**Effect.** The answer to the original question: **`eval.ts` does not touch
the data**. This is a verified fact, not an estimate.

### 5.2 Write paths in `embed.ts` fixed

**Cause.** The script wrote its result to `app/api/docs/data/embeddings.json`.
No such directory exists in the project, so `writeFileSync` failed with
`ENOENT` **after** all embeddings had been computed. And even with a
successful write, the result would have landed in the wrong place:
`search.ts`, `bm25.ts` and `lens.ts` read `lib/data/embed/embeddings.json`.

**What was done.** The path is corrected to the one that is read from.
Reading of the input `chunks.json` was switched to `process.cwd()` so it does
not depend on the launch directory.

**Effect.** The script now works. But it is now capable of overwriting the
real index — which leads directly to the next item.

### 5.3 Atomic writes

**Cause.** `fs.writeFileSync` first truncates the target file to zero and only
then writes. For 21 MB that is a noticeable window: `Ctrl+C`, a process crash
or a network error mid-write leaves a **corrupted file with no backup**. Git
is not initialized in the project; there is nothing to roll back to.

**What was done.** `lib/data/atomic.ts` — `writeJsonAtomic()`: write to a
temporary file next to the target, then `fs.renameSync`. Within a single
filesystem, `rename` is atomic. On error the temporary file is deleted and
the exception is rethrown.

**Effect.** There is never an intermediate state: on disk there is either the
whole old content or the whole new content. Both scripts — `parse.ts` and
`embed.ts` — write through this function.

### 5.4 Protection against vector/chunk desynchronization

**Cause.** In `embed.ts` vectors are stitched to chunks **by array index**:
`chunks.map((c, i) => ({ ...c, embedding: all[i] }))`. If the provider returns
fewer vectors than were sent for some batch, every subsequent chunk gets
someone else's vector. There would be no error — the search would simply
start silently returning text that does not match the vector. This is the
worst kind of breakage: invisible.

**What was done.** Before writing — a hard check
`all.length !== chunks.length` that fails with a clear message. Plus per-batch
progress in the console. Both `parse.ts` and `embed.ts` received comments
stating that they must be run as a pair and in a specific order.

**Effect.** A desync now crashes the script before the write instead of
silently corrupting the index.

### 5.5 Read paths in `parse.ts` fixed

**Cause.** The script read `./pool` and wrote `data/chunks.json` — both paths
relative to the current directory. From the repository root the first path
does not exist; from `lib/data` it would have created
`lib/data/data/chunks.json`, that is, not where `embed.ts` expects its input.

**What was done.** Paths are anchored to `process.cwd()` and aligned with
`embed.ts`: read `lib/data/pool`, write `lib/data/embed/chunks.json`.

**Effect.** Both scripts now work from the repository root and pass data to
each other along the same path.

### 5.6 Paragraphs without an `id` are dropped

**Cause.** `$(el).attr("id")` returns `string | undefined`, but the `Paragraph`
type declared `id: string`. A type error (`TS2345`), and in substance — a
paragraph without an `id` would have ended up in `paragraphIds` as `undefined`
and broken the source reference in search results.

**What was done.** A filter with a type predicate: `p.id !== undefined &&
p.text.length >= 40`.

**Effect.** Only paragraphs that can be referenced make it into chunks.

---

## 6. Types and build

### 6.1 24 type errors → 0

**Cause.** `npx tsc --noEmit` failed with 24 errors — all of them existed
before the work started. Next runs the type check at the `build` stage, which
means **deployment was impossible in principle**, even though `next dev`
worked locally.

Breakdown:

| Error type | Count | Where |
| --- | --- | --- |
| `TS5097` — import with a `.ts` extension | 8 | `bm25` 1, `hybrid` 2, `search` 2, `eval` 3 |
| `TS7006` — implicit `any` in parameters | 13 | `hybrid` 5, `embed` 3, `eval` 4, `lens` 1 |
| `TS7016` — package has no types | 2 | both wink packages |
| `TS2345` — `string \| undefined` vs `string` | 1 | `parse.ts:25` |

**What was done.**

1. **`allowImportingTsExtensions: true`** in `tsconfig.json`. The `.ts`
   extensions in imports are needed so the files can be run with bare `node`
   (native type stripping). The option requires `noEmit: true` — it was already
   set.
2. **`types/wink.d.ts`** — ambient declarations for `wink-bm25-text-search` and
   `wink-nlp-utils`. Neither has its own types or an `@types` package. Only
   the methods actually used are described.
3. Typed `rrf()` in `hybrid.ts`, `show()` in `eval.ts`, and the callbacks in
   `embed.ts` and `lens.ts`.
4. Fixed `parse.ts` (see 5.6).

**Effect.** `npx tsc --noEmit` — clean. `npm run build` passes. A
`npm run typecheck` script was added so this can be checked without a full
build.

A side benefit: the `Chunk` and `Hit` types from `store.ts` now tie all three
search modes together. `hybridSearch` no longer accepts `any` — if the
signature of `search()` changes, `rrf()` will stop compiling.

### 6.2 Deprecated AI SDK API

**Cause.** `openai.textEmbeddingModel()` is marked `@deprecated` in
`@ai-sdk/openai` 4.0.34: "Use `embeddingModel` instead".

**What was done.** Replaced with `openai.embeddingModel()` in `search.ts` and
`embed.ts`. The return type is identical (`EmbeddingModelV4`); behaviour does
not change.

**Effect.** The code will survive a major SDK update that removes the
deprecated alias.

### 6.3 Deprecated React event type

**Cause.** In `@types/react` 19 the `FormEvent` type is marked `@deprecated`
with the note "FormEvent doesn't actually exist".

**What was done.** The `onSubmit` handler is typed as
`SubmitEvent<HTMLFormElement>` — the type React 19 actually passes
(`onSubmit?: SubmitEventHandler<T>`).

**Effect.** No warnings; the type matches the real event.

---

## 7. First screen

File `app/page.tsx` — previously `return <></>`.

**Cause.** The study was run only from the terminal via `eval.ts`. There was
no way to see how the modes behave on an arbitrary query.

**What was done.** A client component:

- an input field with `maxLength={300}` (mirrors the server limit);
- a `Dense / BM25 / Hybrid` switch — a radio group inside a `<fieldset>`
  with `<legend class="sr-only">`; the `<input type="radio">` elements are
  visually hidden but remain in the accessibility tree;
- a caption under the switch explains the selected mode;
- states: loading (`Searching…`, button disabled), error, empty result;
- result cards: number, document, paragraph range in monospace, score on the
  right, text with `line-clamp-6`.

**Effect.** `eval.ts` turned into a screen. You can see where dense beats BM25
and what their fusion adds — which was the subject of the study. Verified in
the browser: the query `notice period for early termination` in hybrid mode
returns 5 fragments with correct metadata.

### 7.1 Dark theme

**Cause.** `globals.css` declared `--background: #ffffff` with no variant for
the dark theme. With a system dark theme the page glowed white.

**What was done.** A `@media (prefers-color-scheme: dark)` block overriding the
tokens; paired `dark:` classes are used in the markup.

**Effect.** The page is correct in both themes (verified with a screenshot in
dark).

### 7.2 Font fixed

**Cause.** `globals.css` set `body { font-family: Arial, Helvetica,
sans-serif }` — this overrode the Geist font that `layout.tsx` loaded via
`next/font` and a CSS variable. A leftover from the `create-next-app`
template.

**What was done.** `font-family: var(--font-geist-sans), system-ui, sans-serif`.

**Effect.** The loaded font is finally applied.

### 7.3 Page metadata

**Cause.** `layout.tsx` still had the placeholders `title: "Create Next App"`,
`description: "Generated by create next app"`.

**What was done.** Replaced with meaningful ones.

**Effect.** The browser tab and link previews show what the project is.

---

## 8. Deployment readiness

### 8.1 Tracing the index file

**Cause.** The most insidious of the problems found. `embeddings.json` is read
via `fs`, not imported — so Next's static analysis does not see it and
**does not put it in the serverless function bundle**. Locally everything
works (the file is on disk); on Vercel `/api/search` fails on the very first
request.

**What was done.** In `next.config.ts`:

```ts
outputFileTracingIncludes: {
  "/api/search": ["./lib/data/embed/embeddings.json"],
}
```

**Effect.** Verified that the route key is correct — Next silently ignores
non-matching keys, so a typo would have looked exactly like a working
setting. After the build:

```
.next/server/app/api/search/route.js.nft.json
  → ../../../../../lib/data/embed/embeddings.json  (exists, 20.9 MiB)
```

### 8.2 A warning in `.gitignore`

**Cause.** 21 MB of generated JSON in the repository looks like junk one would
want to add to `.gitignore`. But without it the build cannot trace the file,
and production breaks — while locally everything keeps working. A trap for a
future "tidy-up".

**What was done.** A comment in `.gitignore` next to the `.env*` block
explaining why `lib/data/embed/*.json` must not be there.

**Effect.** The rule is recorded where it will be read at the right moment.

### 8.3 Explicit runtime

**Cause.** The route uses `fs` and holds 21 MB in memory — incompatible with
the Edge Runtime.

**What was done.** `export const runtime = "nodejs"` in
`app/api/search/route.ts`.

**Effect.** The route will not move to Edge if the defaults change.

---

## 9. Scripts and documentation

**Cause.** Running the scripts depended on the current directory and on
whether `.env` was loaded. Bare `node` **does not read `.env`** — verified:
`node -e "console.log(!!process.env.OPENAI_API_KEY)"` prints `false`, and with
`--env-file=.env` — `true`. This is not obvious, because Next loads `.env`
itself and everything works in dev mode.

**What was done.** npm scripts with the right flags were added:

| Script | Command | Purpose |
| --- | --- | --- |
| `typecheck` | `tsc --noEmit` | type check without a build |
| `data:parse` | `node lib/data/parse.ts` | HTML → `chunks.json` |
| `data:embed` | `node --env-file=.env lib/data/embed.ts` | `chunks.json` → `embeddings.json` |
| `eval` | `node --env-file=.env lib/test/eval.ts` | retrieval quality |

`README.md` was rewritten: modes, the API contract, the index rebuild
procedure, a deployment checklist. A comment with the run command and a note
that the script is read-only was added to `eval.ts`.

**Effect.** No need to remember `--env-file` and the working directory.

---

## 10. What I did not change

Deliberately left as is:

- **Data.** The 29 HTML files in `lib/data/pool`, `chunks.json`,
  `embeddings.json` — not touched by a single byte (checked by `mtime` and size
  before and after all the work).
- **Algorithms.** `cosine.ts` is not changed at all. The RRF formula, the
  constant `k = 60`, the retrieval depth of 20 for each list, the chunk size of
  2000 characters, the paragraph threshold of 40 characters — all preserved.
  The edits concerned types and paths, not ranking logic.
- **The commented-out eval set.** The four questions and the `hit@5` counting
  loop in `eval.ts` are left commented out as they were — this is your working
  material; it is not for me to decide what to do with it.
- **Dependencies.** None added or updated. `npm audit` — 0 vulnerabilities.
  `@ai-sdk/google` remains unused in `package.json`.
- **`.env`.** I did not read the key's contents or move the file. It is
  already covered by the `.env*` rule in `.gitignore`.

---

## 11. How it was verified

| Check | Result |
| --- | --- |
| `npm run build` | passes |
| `npx tsc --noEmit` | 0 errors (was 24) |
| `npm run lint` | 0 errors, 0 warnings |
| `bm25` mode via API | 3 results, correct scores and metadata |
| `dense` mode via API | `s1p112` in 1st place |
| `hybrid` mode via API | `s1p112` in 1st place |
| Input validation | 9 bad requests → 9 × 400 |
| Rate limit | 21st request → 429 + `Retry-After: 39` |
| Vector leak | `'embedding' in results[0]` → `false` |
| File name leak | `'file' in results[0]` → `false` |
| UI in the browser | screenshot, hybrid search worked |
| `npm run eval` | all three modes under bare `node` |
| Bundle tracing | `route.js.nft.json` contains the real path to 20.9 MiB |
| Data integrity | `mtime` of 39 files in `lib/` unchanged |

Separately: the numbers in the comments were re-checked by measurement, not by
estimate. The first estimates ("~6 KB per vector", "1295 chunks") turned out to
be wrong — the real values are 14.1 KB and 1299. The comments and README were
corrected.

---

## 12. What remains to be done

Not in the MVP scope, but will be needed:

1. **`git init`.** This is no longer hygiene but a requirement: without a
   repository there is no deploying to Vercel. `.gitignore` already covers
   `.env*`.
2. **`OPENAI_API_KEY` in the hosting settings.** `.env` does not travel in git.
   Without the key, `dense` and `hybrid` will return 500 while `bm25` keeps
   working — the failure will look like a bug in a specific mode rather than a
   forgotten variable.
3. **Rate limit in shared storage**, if real traffic appears (see 2.2).
4. **Index from a file into a vector store.** 21 MB of JSON is parsed on every
   cold start, plus the BM25 build over 1299 documents. Acceptable for a demo,
   not for load.

---

## 13. File index

### Created (5)

| File | Purpose |
| --- | --- |
| `app/api/search/route.ts` | search endpoint: validation, rate limit, three modes |
| `lib/api/store.ts` | lazy index loading, `Chunk`/`Hit` types, `docLabel`, `toHit` |
| `lib/api/rate-limit.ts` | sliding window, 20 requests/min |
| `lib/data/atomic.ts` | atomic JSON write, reads relative to `process.cwd()` |
| `types/wink.d.ts` | ambient types for the two wink packages |

### Rewritten (9)

| File | Gist |
| --- | --- |
| `app/page.tsx` | first screen (was `<></>`) |
| `app/globals.css` | dark theme, font fixed |
| `lib/api/search.ts` | `getIndex()`, fewer copies, `embeddingModel` |
| `lib/api/bm25.ts` | lazy engine build, `getIndex()`, types |
| `lib/api/hybrid.ts` | fully typed `rrf`, redundant `await` removed |
| `lib/data/embed.ts` | correct path, atomic write, length check |
| `lib/data/parse.ts` | correct paths, atomic write, filter by `id` |
| `lib/test/lens.ts` | switched to `getIndex()` |
| `README.md` | project description instead of the `create-next-app` template |

### Changed in specific places (6)

| File | What |
| --- | --- |
| `lib/test/eval.ts` | `Hit` type for `show()`, comment with the run command |
| `app/layout.tsx` | page metadata |
| `tsconfig.json` | `allowImportingTsExtensions: true` |
| `next.config.ts` | `outputFileTracingIncludes` |
| `package.json` | 4 new scripts |
| `.gitignore` | warning about `lib/data/embed/*.json` |

### Deleted (1)

| File | Reason |
| --- | --- |
| `app/api/chat/route.ts` | generation via `gpt-4.1` — cut out per the task |

### Unchanged

`lib/api/cosine.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.env`,
`package-lock.json`, all data in `lib/data/pool` and `lib/data/embed`.
