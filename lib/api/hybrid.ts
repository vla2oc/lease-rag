import { bm25Search } from "./bm25.ts";
import { search } from "./search.ts";
import type { Hit } from "./store.ts";

export async function hybridSearch(query: string, k = 5): Promise<Hit[]> {
  const dense = await search(query, 20);
  const sparse = bm25Search(query, 20);
  return rrf(dense, sparse, k);
}

function rrf(dense: Hit[], sparse: Hit[], topK = 5, k = 60): Hit[] {
  const scores = new Map<string, { chunk: Hit; score: number }>();

  const add = (results: Hit[]) =>
    results.forEach((c, rank) => {
      const key = c.file + c.paragraphIds[0];
      const prev = scores.get(key);
      scores.set(key, {
        chunk: c,
        score: (prev?.score ?? 0) + 1 / (k + rank + 1),
      });
    });

  add(dense);
  add(sparse);

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => ({ ...x.chunk, score: x.score }));
}
