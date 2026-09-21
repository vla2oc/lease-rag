import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { cosine } from "./cosine.ts";
import { getIndex, toHit, type Hit } from "./store.ts";

export async function search(query: string, k = 5): Promise<Hit[]> {
  const { embedding } = await embed({
    model: openai.embeddingModel("text-embedding-3-small"),
    value: query,
    providerOptions: {
      openai: { dimensions: 768 },
    },
  });

  const index = getIndex();

  const scored = index.map((chunk, i) => ({
    i,
    score: cosine(embedding, chunk.embedding),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ i, score }) => toHit(index[i], score));
}
