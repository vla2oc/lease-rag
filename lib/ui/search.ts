export const MODES = [
  { id: "dense", label: "Dense", hint: "embeddings, cosine similarity" },
  { id: "bm25", label: "BM25", hint: "lexical, no network calls" },
  { id: "hybrid", label: "Hybrid", hint: "dense + BM25, fused via RRF" },
] as const;

export type Mode = (typeof MODES)[number]["id"];

export type Result = {
  doc: string;
  paragraphIds: string[];
  score: number;
  text: string;
};

// One question and its answer in the thread. results and error are null
// while the request is in flight.
export type Turn = {
  id: number;
  query: string;
  mode: Mode;
  results: Result[] | null;
  error: string | null;
};

export const EXAMPLES = [
  "notice period for early termination",
  "who pays for repairs of the premises",
  "security deposit amount and return",
] as const;
