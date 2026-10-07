"use client";

import { useState, type SubmitEvent } from "react";

const MODES = [
  { id: "dense", label: "Dense", hint: "embeddings, cosine similarity" },
  { id: "bm25", label: "BM25", hint: "lexical, no network calls" },
  { id: "hybrid", label: "Hybrid", hint: "dense + BM25, fused via RRF" },
] as const;

type Mode = (typeof MODES)[number]["id"];

type Result = {
  doc: string;
  paragraphIds: string[];
  score: number;
  text: string;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, mode, k: 5 }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults(null);
        return;
      }
      setResults(data.results);
    } catch {
      setError("Could not reach the server");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const activeHint = MODES.find((m) => m.id === mode)!.hint;

  return (
    <main className="mx-auto w-full max-w-3xl grow px-5 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Lease Search</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          Search over 29 lease agreements. Returns the original contract
          fragments, with no LLM-generated answer.
        </p>
      </header>

      <form onSubmit={runSearch}>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={300}
            placeholder="e.g. notice period for early termination"
            aria-label="Search query"
            className="min-w-0 grow rounded-lg border border-neutral-300 bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-300"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="shrink-0 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <fieldset className="mt-3">
          <legend className="sr-only">Search mode</legend>
          <div className="inline-flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m.id
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => setMode(m.id)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {activeHint}
          </p>
        </fieldset>
      </form>

      {error && (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {results && !error && (
        <section className="mt-10">
          <h2 className="mb-4 text-xs font-medium tracking-wide text-neutral-400 uppercase">
            {results.length > 0
              ? `${results.length} fragments · ${mode}`
              : "Nothing found"}
          </h2>

          <ol className="space-y-3">
            {results.map((r, i) => (
              <li
                key={`${r.doc}-${r.paragraphIds[0]}`}
                className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-neutral-400">{i + 1}</span>
                  <span className="font-medium">{r.doc}</span>
                  <span className="font-mono text-neutral-400">
                    {r.paragraphIds[0]}–{r.paragraphIds.at(-1)}
                  </span>
                  <span className="ml-auto font-mono text-neutral-400">
                    {r.score.toFixed(3)}
                  </span>
                </div>
                <p className="mt-2.5 line-clamp-6 text-sm leading-relaxed whitespace-pre-line text-neutral-700 dark:text-neutral-300">
                  {r.text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
