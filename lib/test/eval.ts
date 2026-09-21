import { search } from "../api/search.ts";
import { bm25Search } from "../api/bm25.ts";
import { hybridSearch } from "../api/hybrid.ts";
import type { Hit } from "../api/store.ts";

const evalSet = [
  {
    question: "WICKFIELD PHOENIX, LLC, a Michigan limited liability company",
    file: "lease_427",
    goldId: "s1p112",
    answer:
      "45 days (or longer if the default reasonably requires more time and Tenant promptly commenced and diligently pursued the cure)",
  },
];

const show = (name: string, results: Hit[]) => {
  console.log(`\n=== ${name} ===`);
  results.forEach((r, i) =>
    console.log(
      `${i + 1}. ${r.score.toFixed(3)}  ${r.file.slice(-16)}  ${r.paragraphIds[0]}–${r.paragraphIds.at(-1)}`,
    ),
  );
  console.log("\ntop-1 text:", results[0].text.slice(0, 200));
};
const q = evalSet[0].question;

show("DENSE", await search(q, 5));
show("BM25", bm25Search(q, 5));
show("HYBRID", await hybridSearch(q, 5));
