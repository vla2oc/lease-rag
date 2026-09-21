import * as fs from "fs";
import path from "path";

export type Chunk = {
  text: string;
  paragraphIds: string[];
  file: string;
  embedding: number[];
};

export type Hit = Omit<Chunk, "embedding"> & { score: number };

// Read via fs rather than imported, so Next's file tracing can't see it —
// it is listed in outputFileTracingIncludes in next.config.ts instead.
const INDEX_PATH = path.join(process.cwd(), "lib/data/embed/embeddings.json");

let cached: Chunk[] | null = null;

export function getIndex(): Chunk[] {
  cached ??= JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Chunk[];
  return cached;
}

// "a.doaHDzg8N…-lease_427.plain.html" → "lease_427": the store id is internal.
export function docLabel(file: string): string {
  return file.replace(/^[^-]*-/, "").replace(/\.plain\.html$/, "");
}

// Fields are listed explicitly, not spread: the embedding (~14 KB per chunk)
// must never reach the response, and new Chunk fields must not leak by default.
export function toHit(chunk: Chunk, score: number): Hit {
  return {
    text: chunk.text,
    paragraphIds: chunk.paragraphIds,
    file: chunk.file,
    score,
  };
}
