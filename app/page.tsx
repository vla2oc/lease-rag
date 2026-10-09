"use client";

import { AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { Hero } from "./components/Hero.tsx";
import { SearchBar } from "./components/SearchBar.tsx";
import { Thread } from "./components/Thread.tsx";
import type { Mode, Turn } from "../lib/ui/search.ts";

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const nextId = useRef(0);

  async function runSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const id = nextId.current++;
    setTurns((prev) => [
      ...prev,
      { id, query: trimmed, mode, results: null, error: null },
    ]);
    setQuery("");
    setLoading(true);

    const patch = (update: Partial<Turn>) =>
      setTurns((prev) =>
        prev.map((turn) => (turn.id === id ? { ...turn, ...update } : turn)),
      );

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, mode, k: 5 }),
      });
      const data = await res.json();
      if (!res.ok) {
        patch({ error: data.error ?? "Search failed" });
        return;
      }
      patch({ results: data.results });
    } catch {
      patch({ error: "Could not reach the server" });
    } finally {
      setLoading(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <main className="flex min-h-dvh grow flex-col">
      <AnimatePresence>
        {empty ? (
          <Hero key="hero" onPick={runSearch} />
        ) : (
          <Thread key="thread" turns={turns} />
        )}
      </AnimatePresence>

      <SearchBar
        query={query}
        mode={mode}
        loading={loading}
        onQueryChange={setQuery}
        onModeChange={setMode}
        onSubmit={() => runSearch(query)}
      />
    </main>
  );
}
