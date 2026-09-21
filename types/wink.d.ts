// The wink packages ship no types and have no @types. Only what
// lib/api/bm25.ts actually uses is declared here.

declare module "wink-bm25-text-search" {
  /** Prep tasks are chained; each takes a string or a token array. */
  type PrepTask = (input: never) => unknown;

  interface BM25Engine {
    defineConfig(config: {
      fldWeights: Record<string, number>;
      bm25Params?: { k1?: number; b?: number; k?: number };
    }): number;
    definePrepTasks(tasks: PrepTask[], field?: string | null): number;
    addDoc(doc: Record<string, string>, id: number): number;
    consolidate(factor?: number): boolean;
    /** Returns [docId, score] pairs sorted by descending score. */
    search(text: string, limit?: number): [number, number][];
    reset(): boolean;
  }

  const bm25: { (): BM25Engine; new (): BM25Engine };
  export default bm25;
}

declare module "wink-nlp-utils" {
  const nlp: {
    string: {
      lowerCase(input: string): string;
      removeExtraSpaces(input: string): string;
      tokenize0(input: string): string[];
    };
    tokens: {
      removeWords(tokens: string[]): string[];
      stem(tokens: string[]): string[];
    };
  };
  export default nlp;
}
