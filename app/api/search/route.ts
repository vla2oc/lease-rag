import { search } from "../../../lib/api/search.ts";
import { bm25Search } from "../../../lib/api/bm25.ts";
import { hybridSearch } from "../../../lib/api/hybrid.ts";
import { docLabel } from "../../../lib/api/store.ts";
import { clientKey, rateLimit } from "../../../lib/api/rate-limit.ts";

export const runtime = "nodejs";

const MODES = ["dense", "bm25", "hybrid"] as const;
type Mode = (typeof MODES)[number];

const MAX_QUERY_LENGTH = 300;
const MAX_K = 10;

function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req));
  if (!limit.ok) {
    return Response.json(
      { error: "Слишком много запросов, попробуйте позже" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Тело запроса должно быть корректным JSON");
  }

  if (typeof body !== "object" || body === null) {
    return bad("Тело запроса должно быть объектом");
  }

  const { query, mode = "hybrid", k = 5 } = body as Record<string, unknown>;

  if (typeof query !== "string") return bad("Поле query должно быть строкой");

  const trimmed = query.trim();
  if (!trimmed) return bad("Поле query не должно быть пустым");
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return bad(`Запрос длиннее ${MAX_QUERY_LENGTH} символов`);
  }

  if (!isMode(mode)) return bad(`Поле mode должно быть одним из: ${MODES}`);

  if (typeof k !== "number" || !Number.isInteger(k) || k < 1 || k > MAX_K) {
    return bad(`Поле k должно быть целым числом от 1 до ${MAX_K}`);
  }

  try {
    const hits =
      mode === "bm25"
        ? bm25Search(trimmed, k)
        : mode === "dense"
          ? await search(trimmed, k)
          : await hybridSearch(trimmed, k);

    return Response.json({
      mode,
      results: hits.map((h) => ({
        doc: docLabel(h.file),
        paragraphIds: h.paragraphIds,
        score: h.score,
        text: h.text,
      })),
    });
  } catch (error) {
    console.error("[api/search]", error);
    return bad("Поиск не удался", 500);
  }
}
