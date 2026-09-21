import * as cheerio from "cheerio";
import * as fs from "fs";
import path from "path";
import { writeJsonAtomic } from "./atomic.ts";

// After regenerating chunks.json, embeddings.json MUST be regenerated too
// (npm run data:embed). Vectors are matched to chunks by array index — a
// mismatch doesn't fail, it silently returns text for the wrong vector.

type Paragraph = { id: string; text: string };
type Chunk = { text: string; paragraphIds: string[]; file: string };

const POOL_PATH = path.join(process.cwd(), "lib/data/pool");
const OUT_PATH = "lib/data/embed/chunks.json";
const MAX_CHARS = 2000;
const MIN_PARAGRAPH_CHARS = 40;

function makeChunks(paragraphs: Paragraph[], file: string): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer: Paragraph[] = [];
  let size = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push({
      text: buffer.map((p) => p.text).join("\n"),
      paragraphIds: buffer.map((p) => p.id),
      file,
    });
    buffer = [];
    size = 0;
  };

  for (const paragraph of paragraphs) {
    buffer.push(paragraph);
    size += paragraph.text.length;
    if (size >= MAX_CHARS) flush();
  }
  flush();

  return chunks;
}

const files = fs.readdirSync(POOL_PATH).filter((f) => f.endsWith(".html"));
const allChunks: Chunk[] = [];

for (const file of files) {
  const html = fs.readFileSync(path.join(POOL_PATH, file), "utf-8");
  const $ = cheerio.load(html);

  const paragraphs = $("p")
    .toArray()
    .map((el) => ({ id: $(el).attr("id"), text: $(el).text().trim() }))
    // Paragraphs without an id can't be referenced in results.
    .filter(
      (p): p is Paragraph =>
        p.id !== undefined && p.text.length >= MIN_PARAGRAPH_CHARS,
    );

  allChunks.push(...makeChunks(paragraphs, file));
}

writeJsonAtomic(OUT_PATH, allChunks, 2);

console.log("files:", files.length);
console.log("chunks saved:", allChunks.length, "→", OUT_PATH);
console.log("remember to regenerate embeddings.json");
