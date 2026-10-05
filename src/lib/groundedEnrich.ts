// Server-side grounded enrichment: the model answers factual fields only from
// the collected source chunks, and plain code then checks every quote it cited
// (src/lib/rag/ground.ts). Never imported by client code.
import type { GoogleGenAI } from "@google/genai";
import { GROUNDED_SYSTEM_PROMPT, GROUNDED_ENRICH_SCHEMA } from "./geminiPrompts.js";
import { getNaverId } from "./naverId.js";
import { englishSignal } from "./leadFilter.js";
import { EnrichedLeadSchema } from "./validation.js";
import { genaiClient, withRetry, type UsageSink } from "./serverActions.js";
import {
  buildContext, formatContext, retrieveChunks, verifyFacts, selectEmail,
  type ContextChunk, type Embedder, type EmbeddingStore,
} from "./rag/ground.js";
import type { Source } from "./rag/collect.js";
import type { CandidateEmail, EnrichedLead, FactStatus, GroundedFact, GroundedFacts, GroundedMode, NaverSearchResult } from "../types";

// Stable text embedding model (see ai.google.dev/gemini-api/docs/embeddings).
// 256 dimensions keeps a chunk's vector small enough to cache on the source
// document; raise it if retrieval quality needs it.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 256;

export function geminiEmbedder(ai: GoogleGenAI, onUsage?: UsageSink): Embedder {
  return async (texts, kind) => {
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
      config: { taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT", outputDimensionality: EMBEDDING_DIMS },
    });
    onUsage?.({ input_tokens: 0, output_tokens: 0, kind: "embed" });
    return (res.embeddings ?? []).map(e => e.values ?? []);
  };
}

const STATUSES: FactStatus[] = ["sourced", "inferred", "not_found"];

// What the model returned for one fact, as a GroundedFact before verification.
function toFact<V extends string | string[]>(raw: any): GroundedFact<V> {
  const status: FactStatus = STATUSES.includes(raw?.status) ? raw.status : "not_found";
  return {
    value: raw?.value ?? null,
    status,
    chunk_id: raw?.chunk_id ?? null,
    quote: raw?.quote ?? null,
    source_url: null,
    source_type: null,
    verification: null,
  };
}

export interface GroundedContext {
  chunks: ContextChunk[];
  dropped: number;
}

// Pure: model output + context -> the lead. Facts are verified in code, the
// email is chosen in code, and Naver-owned fields come from the listing.
export function buildGroundedLead(
  item: NaverSearchResult,
  out: any,
  ctx: GroundedContext,
  candidateEmails: CandidateEmail[] | undefined,
  mode: GroundedMode,
  website: string | null = null,
  now: () => string = () => new Date().toISOString(),
): EnrichedLead {
  const raw: GroundedFacts = {
    age_range: toFact(out.facts?.age_range),
    approx_students: toFact(out.facts?.approx_students),
    cefr_levels: toFact(out.facts?.cefr_levels),
    hook: toFact(out.facts?.hook),
  };
  const { facts, failures } = verifyFacts(raw, ctx.chunks);
  const email = selectEmail(candidateEmails);
  const signal = englishSignal(item);

  return {
    institution_name_en: out.institution_name_en,
    institution_name_kr: out.institution_name_kr,
    institution_type: out.institution_type,
    city: out.city,
    district: out.district,
    // Owned by Naver, not the model.
    naver_id: getNaverId(item),
    phone: item.telephone,
    address_full: item.roadAddress || item.address,
    website,
    ...email,
    // Flat fields the UI and email drafting read, filled from the facts. A
    // missing hook is "" (not "not found"): the email prompt treats an empty
    // hook as missing and would otherwise quote the words "not found".
    student_age_range: facts.age_range.value ?? "not found",
    approx_students: facts.approx_students.value ?? "not found",
    cefr_levels_taught: facts.cefr_levels.value ?? [],
    personalization_hook: facts.hook.value ?? "",
    outreach_priority: out.outreach_priority,
    fit_reason: out.fit_reason,
    agent_notes: out.agent_notes,
    firebase_status: "not_contacted",
    naver_raw: item,
    english_signal: signal === "confirmed" ? "confirmed" : "unsure",
    needs_review: signal !== "confirmed",
    facts,
    grounding: {
      mode,
      chunks_given: ctx.chunks.length,
      chunks_dropped: ctx.dropped,
      verification_failures: failures,
      enriched_at: now(),
    },
  } as EnrichedLead;
}

export interface GroundedInput {
  sources: Pick<Source, "status" | "type" | "url" | "chunks">[];
  candidate_emails?: CandidateEmail[];
  website?: string | null;
  // grounded_retrieval only; filled in place so the caller can persist it.
  embeddings?: EmbeddingStore;
}

export interface GroundedDeps {
  ai?: GoogleGenAI;
  embed?: Embedder;
  onUsage?: UsageSink;
  now?: () => string;
}

export async function enrichGroundedServer(
  item: NaverSearchResult,
  input: GroundedInput,
  mode: GroundedMode,
  deps: GroundedDeps = {},
): Promise<EnrichedLead> {
  if (!item) throw Object.assign(new Error("item is required."), { status: 400 });
  const ai = deps.ai ?? genaiClient();

  const all = buildContext(input.sources, mode);
  const ctx: GroundedContext = mode === "grounded_retrieval"
    ? { chunks: await retrieveChunks(all.chunks, deps.embed ?? geminiEmbedder(ai, deps.onUsage), input.embeddings ?? {}), dropped: 0 }
    : all;
  // In retrieval mode "dropped" is what the top-k left out.
  if (mode === "grounded_retrieval") ctx.dropped = all.chunks.length - ctx.chunks.length;

  const contents = `NAVER LISTING:\n${JSON.stringify({ ...item, naver_id: getNaverId(item), english_signal: englishSignal(item) })}\n\nSOURCE CHUNKS:\n${ctx.chunks.length ? formatContext(ctx.chunks) : "(none)"}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents,
        config: { systemInstruction: GROUNDED_SYSTEM_PROMPT, responseMimeType: "application/json", responseSchema: GROUNDED_ENRICH_SCHEMA },
      }));
      deps.onUsage?.({ input_tokens: response.usageMetadata?.promptTokenCount ?? 0, output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0, kind: "generate" });
      const text = response.text;
      if (!text) throw new Error("No response from Gemini.");
      const lead = buildGroundedLead(item, JSON.parse(text), ctx, input.candidate_emails, mode, input.website ?? null, deps.now);
      return EnrichedLeadSchema.parse(lead) as EnrichedLead;
    } catch (err) {
      if ((err as any)?.quota) throw err;
      lastError = err;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw Object.assign(new Error(`Gemini returned a malformed grounded lead after retry: ${message}`), { status: 502 });
}
