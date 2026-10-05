// Server-only: collect sources for one saved lead if they're stale, run
// grounded enrichment, and (with write) save the result. Shared by
// scripts/enrich-grounded.ts and /api/enrich-grounded.
import type { Firestore } from "firebase-admin/firestore";
import { collectForLead, type Source } from "./collect.js";
import { saveSources, LEADS_COLLECTION } from "./store.js";
import { DEFAULT_GROUNDED_MODE, type EmbeddingStore } from "./ground.js";
import { enrichGroundedServer, type GroundedDeps } from "../groundedEnrich.js";
import type { EnrichedLead, GroundedMode } from "../../types";

export const SOURCES_MAX_AGE_DAYS = 30;

export const sourcesAreFresh = (lead: Pick<EnrichedLead, "sources_collected_at">, now = Date.now()) =>
  !!lead.sources_collected_at && now - new Date(lead.sources_collected_at).getTime() < SOURCES_MAX_AGE_DAYS * 86_400_000;

// The fields a re-enrichment changes. Anything a person typed in
// (manual_fields) and any verified email is kept; a guessed (estimated) email
// is cleared, since grounded modes never construct an address.
export function mergeGrounded(lead: EnrichedLead, g: EnrichedLead): Record<string, unknown> {
  const manual = new Set(lead.manual_fields ?? []);
  const update: Record<string, unknown> = {
    facts: g.facts,
    grounding: g.grounding,
    cefr_levels_taught: g.cefr_levels_taught,
    personalization_hook: g.personalization_hook,
    outreach_priority: g.outreach_priority,
    fit_reason: g.fit_reason,
    agent_notes: g.agent_notes,
  };
  if (!manual.has("student_age_range")) update.student_age_range = g.student_age_range;
  if (!manual.has("approx_students")) update.approx_students = g.approx_students;

  const emailLocked = manual.has("email") || lead.email_verification === "verified";
  if (!emailLocked) {
    if (g.email) {
      update.email = g.email;
      update.email_confidence = "scraped";
    } else if (lead.email_confidence === "estimated") {
      update.email = "";
      update.email_confidence = "unknown";
    }
  }
  return update;
}

export async function loadStoredSources(db: Firestore, naverId: string): Promise<{ sources: Source[]; embeddings: EmbeddingStore }> {
  const snap = await db.collection(LEADS_COLLECTION).doc(naverId).collection("sources").get();
  const embeddings: EmbeddingStore = {};
  const sources = snap.docs.map(d => {
    const { embeddings: cached, ...data } = d.data() as any;
    Object.assign(embeddings, cached ?? {});
    return { id: d.id, ...data } as Source;
  });
  return { sources, embeddings };
}

// Embeddings live on the source document their chunk came from
// (chunk ids are "{sourceId}#{n}").
async function saveEmbeddings(db: Firestore, naverId: string, store: EmbeddingStore) {
  const bySource: Record<string, EmbeddingStore> = {};
  for (const [chunkId, v] of Object.entries(store)) {
    const sourceId = chunkId.split("#")[0];
    (bySource[sourceId] ??= {})[chunkId] = v;
  }
  const sources = db.collection(LEADS_COLLECTION).doc(naverId).collection("sources");
  await Promise.all(Object.entries(bySource).map(([id, embeddings]) => sources.doc(id).update({ embeddings })));
}

export interface ReenrichOptions {
  mode?: GroundedMode;
  write: boolean;
  deps?: GroundedDeps;
}

export async function reenrichLead(db: Firestore, lead: EnrichedLead, opts: ReenrichOptions) {
  const mode = opts.mode ?? DEFAULT_GROUNDED_MODE;
  if (!lead.naver_raw) throw new Error("Lead has no Naver listing to enrich from.");

  let sources: Source[];
  let embeddings: EmbeddingStore = {};
  let candidate_emails = lead.candidate_emails;
  let collected = false;
  if (sourcesAreFresh(lead)) {
    ({ sources, embeddings } = await loadStoredSources(db, lead.naver_id));
  } else {
    const result = await collectForLead(lead);
    if (opts.write) await saveSources(db, lead.naver_id, result);
    sources = result.sources;
    candidate_emails = result.candidate_emails;
    collected = true;
  }

  const grounded = await enrichGroundedServer(
    lead.naver_raw,
    { sources, candidate_emails, website: lead.website ?? null, embeddings },
    mode,
    opts.deps,
  );
  const update = mergeGrounded(lead, grounded);
  if (opts.write) {
    await db.collection(LEADS_COLLECTION).doc(lead.naver_id).update(update);
    if (mode === "grounded_retrieval") await saveEmbeddings(db, lead.naver_id, embeddings);
  }
  return { update, grounded, collected };
}
