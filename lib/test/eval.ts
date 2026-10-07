import { search } from "../api/search.ts";
import { bm25Search } from "../api/bm25.ts";
import { hybridSearch } from "../api/hybrid.ts";
import { docLabel, getIndex, type Hit } from "../api/store.ts";

type Question = { question: string; file: string; goldId: string };

const evalSet: Question[] = [
  {
    question: "When does the Zomedica lease end?",
    file: "lease_427",
    goldId: "s1p21",
  },
  {
    question:
      "What is Zomedica's Tenant's Proportionate Share under the Wickfield Phoenix lease?",
    file: "lease_427",
    goldId: "s1p33",
  },
  {
    question:
      "What is the Construction Allowance for the Must-Take CB Space under Lease Amendment No. 3?",
    file: "lease_652",
    goldId: "s1p1103",
  },
  {
    question:
      "What is the maximum Tenant Improvement Allowance the Landlord will pay for Suite 190?",
    file: "lease_427",
    goldId: "s1p54",
  },
  {
    question:
      "What is the Holdover Rate if Reata stays in the Premises after lease termination?",
    file: "lease_652",
    goldId: "s1p300",
  },
  {
    question:
      "Above what aggregate cost does an alteration stop qualifying as a Permitted Alteration in the Zomedica lease?",
    file: "lease_427",
    goldId: "s1p60",
  },
];

const K = 5;

const isGold = (hit: Hit, q: Question) =>
  docLabel(hit.file) === q.file && hit.paragraphIds.includes(q.goldId);

// 1-based rank of the first chunk containing the gold paragraph, 0 if absent
const rankOf = (hits: Hit[], q: Question) =>
  hits.findIndex((h) => isGold(h, q)) + 1;

// A gold paragraph can be missing from the index entirely (dropped at parse
// time), in which case no retriever can ever find it — report it separately.
const inIndex = (q: Question) =>
  getIndex().some(
    (c) => docLabel(c.file) === q.file && c.paragraphIds.includes(q.goldId),
  );

const allModes: Record<string, (q: string) => Promise<Hit[]> | Hit[]> = {
  dense: (q) => search(q, K),
  bm25: (q) => bm25Search(q, K),
  hybrid: (q) => hybridSearch(q, K),
};

// dense and hybrid embed the query through OpenAI; without a key only the
// network-free bm25 channel can run, so report that row instead of crashing.
const hasKey = Boolean(process.env.OPENAI_API_KEY);
const modes = hasKey ? allModes : { bm25: allModes.bm25 };

const ranks: Record<string, number[]> = {};
for (const mode of Object.keys(modes)) ranks[mode] = [];

console.log(`\n${evalSet.length} questions, top-${K}\n`);
if (!hasKey) {
  console.log("OPENAI_API_KEY is not set: skipping dense and hybrid, bm25 only\n");
}
for (const q of evalSet) {
  console.log(`Q: ${q.question}`);
  console.log(
    `   gold ${q.file} ${q.goldId}${inIndex(q) ? "" : "  (NOT IN INDEX)"}`,
  );
  for (const [mode, run] of Object.entries(modes)) {
    const r = rankOf(await run(q.question), q);
    ranks[mode].push(r);
    console.log(`   ${mode.padEnd(7)} rank ${r || "miss"}`);
  }
}

const n = evalSet.length;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / n;
console.log(`\nmode     hit@1   hit@${K}   MRR`);
for (const [mode, rs] of Object.entries(ranks)) {
  const hit1 = avg(rs.map((r) => (r === 1 ? 1 : 0)));
  const hitK = avg(rs.map((r) => (r >= 1 && r <= K ? 1 : 0)));
  const mrr = avg(rs.map((r) => (r ? 1 / r : 0)));
  console.log(
    `${mode.padEnd(8)} ${hit1.toFixed(2)}    ${hitK.toFixed(2)}    ${mrr.toFixed(2)}`,
  );
}
