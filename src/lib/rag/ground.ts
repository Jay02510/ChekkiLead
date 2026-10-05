// Pure helpers for grounded enrichment: building the chunk context, checking
// a model's cited quotes in plain code, picking the email, and cosine top-k.
// Nothing here calls a model or the network.
import type { CandidateEmail, GroundedFact, GroundedFacts, GroundedMode, SourceType } from "../../types";
import type { Chunk, Source } from "./collect";

// Used by scripts/enrich-grounded.ts and the "Re-enrich with sources" button
// until eval:compare says otherwise.
export const DEFAULT_GROUNDED_MODE: GroundedMode = "grounded_full";

export const MAX_CONTEXT_CHARS = 40_000;
export const TOP_K_PER_QUERY = 6;

// One Korean query per field; retrieval takes the top chunks for each.
export const RETRIEVAL_QUERIES = {
  age: "수업 대상 연령 학년 몇 세 초등 유치부",
  levels: "레벨 반 편성 커리큘럼 교재 수준",
  size: "원생 수 학생 수 반 인원 규모",
  hook: "우리 학원 소개 특징 프로그램 행사 수상 소식",
} as const;

export interface ContextChunk {
  id: string;
  source_type: SourceType;
  source_url: string;
  text: string;
}

const OWN_FIRST: Record<SourceType, number> = { blog_own: 0, website: 1, blog_third_party: 2 };

// Usable chunks, own sources first (blog_own, then website), then third-party.
// grounded_full stops at MAX_CONTEXT_CHARS and reports how many chunks it
// dropped; grounded_retrieval returns every chunk and selects later.
export function buildContext(sources: Pick<Source, "status" | "type" | "url" | "chunks">[], mode: GroundedMode): { chunks: ContextChunk[]; dropped: number } {
  const all: ContextChunk[] = [...sources]
    .filter(s => s.status === "ok")
    .sort((a, b) => OWN_FIRST[a.type] - OWN_FIRST[b.type])
    .flatMap(s => s.chunks.map((c: Chunk) => ({ id: c.id, source_type: s.type, source_url: s.url, text: c.text })));
  if (mode === "grounded_retrieval") return { chunks: all, dropped: 0 };

  const kept: ContextChunk[] = [];
  let total = 0;
  for (const c of all) {
    if (total + c.text.length > MAX_CONTEXT_CHARS) break;
    kept.push(c);
    total += c.text.length;
  }
  return { chunks: kept, dropped: all.length - kept.length };
}

// What the model reads: "[chunk_id | source_type] text".
export const formatContext = (chunks: ContextChunk[]) =>
  chunks.map(c => `[${c.id} | ${c.source_type}]\n${c.text}`).join("\n\n");

// ---------- retrieval ----------

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Ids of the k items most similar to the query, best first.
export function topK(query: number[], items: { id: string; vec: number[] }[], k: number): string[] {
  return items
    .map(i => ({ id: i.id, score: cosine(query, i.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(i => i.id);
}

export type Embedder = (texts: string[], kind: "query" | "document") => Promise<number[][]>;
// chunk id -> embedding, with a hash of the text it was computed from so an
// edited chunk is re-embedded. Persisted by the caller.
export type EmbeddingStore = Record<string, { hash: string; v: number[] }>;

export const textHash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
};

// The union of the top TOP_K_PER_QUERY chunks for each field query, kept in
// context order (own sources first). Embeds only chunks the store lacks.
export async function retrieveChunks(chunks: ContextChunk[], embed: Embedder, store: EmbeddingStore): Promise<ContextChunk[]> {
  if (chunks.length === 0) return [];
  const missing = chunks.filter(c => store[c.id]?.hash !== textHash(c.text));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const vecs = await embed(batch.map(c => c.text), "document");
    batch.forEach((c, j) => { store[c.id] = { hash: textHash(c.text), v: vecs[j] }; });
  }
  const queryVecs = await embed(Object.values(RETRIEVAL_QUERIES), "query");
  const items = chunks.map(c => ({ id: c.id, vec: store[c.id].v }));
  const picked = new Set(queryVecs.flatMap(q => topK(q, items, TOP_K_PER_QUERY)));
  return chunks.filter(c => picked.has(c.id));
}

// ---------- verification ----------

// Full-width forms (１２３, ＡＢＣ) to ASCII, then collapse whitespace.
export const normalizeQuote = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

const emptyFact = <V extends string | string[]>(over: Partial<GroundedFact<V>> = {}): GroundedFact<V> => ({
  value: null, status: "not_found", chunk_id: null, quote: null, source_url: null, source_type: null, verification: null, ...over,
});

export function verifyFact<V extends string | string[]>(
  fact: GroundedFact<V>,
  chunks: ContextChunk[],
  opts: { ownSourceOnly?: boolean } = {},
): { fact: GroundedFact<V>; failed: boolean } {
  if (fact.status === "not_found") return { fact: emptyFact<V>(), failed: false };

  const reject = (reason: string) => ({
    failed: true,
    fact: emptyFact<V>({ verification: "failed", rejected: [{ chunk_id: fact.chunk_id, quote: fact.quote, reason }] }),
  });

  const hasValue = Array.isArray(fact.value) ? fact.value.length > 0 : !!fact.value;
  if (!hasValue) return reject("no value");
  const chunk = chunks.find(c => c.id === fact.chunk_id);
  if (!chunk) return reject("chunk_id was not given to the model");
  if (!fact.quote || !normalizeQuote(chunk.text).includes(normalizeQuote(fact.quote))) return reject("quote not found in the cited chunk");
  if (opts.ownSourceOnly && chunk.source_type === "blog_third_party") return reject("cited a third-party chunk");

  return {
    failed: false,
    fact: { ...fact, source_url: chunk.source_url, source_type: chunk.source_type, verification: "passed" },
  };
}

// Checks every fact the model cited, in code. A fact that fails becomes
// not_found with verification "failed". The hook may only cite an own source:
// a director must never get an email quoting a parent's blog post.
export function verifyFacts(facts: GroundedFacts, chunksGiven: ContextChunk[]): { facts: GroundedFacts; failures: number } {
  const age = verifyFact(facts.age_range, chunksGiven);
  const students = verifyFact(facts.approx_students, chunksGiven);
  const levels = verifyFact(facts.cefr_levels, chunksGiven);
  const hook = verifyFact(facts.hook, chunksGiven, { ownSourceOnly: true });
  return {
    facts: { age_range: age.fact, approx_students: students.fact, cefr_levels: levels.fact, hook: hook.fact },
    failures: [age, students, levels, hook].filter(r => r.failed).length,
  };
}

// ---------- email ----------

// The first email found on the academy's own blog or website. Never built
// from a name or domain; entries without an explicit sourceType (snapshots
// from before it existed) are not trusted.
export function selectEmail(candidates: CandidateEmail[] | undefined): { email: string; email_confidence: "scraped" | "unknown" } {
  const own = (candidates ?? []).find(c => c.sourceType === "blog_own" || c.sourceType === "website");
  return own ? { email: own.email, email_confidence: "scraped" } : { email: "", email_confidence: "unknown" };
}
