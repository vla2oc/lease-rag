import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { readJson, writeJsonAtomic } from "./atomic.ts";

type Chunk = { text: string; paragraphIds: string[]; file: string };

const BATCH = 300;
const CHUNKS_PATH = "lib/data/embed/chunks.json";
const OUT_PATH = "lib/data/embed/embeddings.json";

const chunks = readJson<Chunk[]>(CHUNKS_PATH);
const all: number[][] = [];

for (let i = 0; i < chunks.length; i += BATCH) {
  const { embeddings } = await embedMany({
    model: openai.embeddingModel("text-embedding-3-small"),
    values: chunks.slice(i, i + BATCH).map((c) => c.text),
    providerOptions: {
      openai: { dimensions: 768 },
    },
  });
  all.push(...embeddings);
  console.log(`batch ${i / BATCH + 1}: ${all.length}/${chunks.length}`);
}

// Vectors are matched to chunks by index. If the provider returns fewer than
// we sent, everything would silently shift — fail here instead.
if (all.length !== chunks.length) {
  throw new Error(
    `Got ${all.length} vectors for ${chunks.length} chunks — index not written`,
  );
}

const indexed = chunks.map((c, i) => ({ ...c, embedding: all[i] }));
writeJsonAtomic(OUT_PATH, indexed);

console.log("vectors:", all.length);
console.log("dimensions:", all[0].length);
console.log("written:", OUT_PATH);
