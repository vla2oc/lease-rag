import bm25 from "wink-bm25-text-search";
import nlp from "wink-nlp-utils";
import { getIndex, toHit, type Hit } from "./store.ts";

let engine: ReturnType<typeof bm25> | null = null;

function getEngine() {
  if (engine) return engine;

  const built = new bm25();
  built.defineConfig({ fldWeights: { text: 1 } });
  built.definePrepTasks([
    nlp.string.lowerCase,
    nlp.string.removeExtraSpaces,
    nlp.string.tokenize0,
    nlp.tokens.removeWords,
    nlp.tokens.stem,
  ]);

  getIndex().forEach((chunk, i) => built.addDoc({ text: chunk.text }, i));
  built.consolidate();

  engine = built;
  return engine;
}

export function bm25Search(query: string, k = 5): Hit[] {
  const index = getIndex();
  return getEngine()
    .search(query)
    .slice(0, k)
    .map(([id, score]: [number, number]) => toHit(index[id], score));
}
