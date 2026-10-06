// The sweep/enrich split.
//
// One Vercel invocation has 60 seconds. A real Gemini call takes several, so a
// sweep that enriched inline could afford one query per day — a full pass over
// the 152-query search plan would have taken five months. Searching is cheap
// and enriching is not, so they are now two jobs: the sweep saves what Naver
// returned and nothing else, and a second cron drains the queue a couple of
// leads at a time.
//
// A queued record holds only what Naver said. No field here is a guess, which
// is the point: a lead can sit in the queue for days without anyone reading an
// invented age range off it.
import type { EnrichedLead, NaverSearchResult } from "../types";
import { getNaverId, stripHtml } from "./naverId.js";
import { englishSignal } from "./leadFilter.js";

export type EnrichmentStatus = "queued" | "enriched" | "failed";

// "서울특별시 마포구 상암동 1679" -> city 서울특별시, district 마포구. Left in
// Korean: enrichment overwrites both with the model's English forms, and a
// wrong guess here would be a guess in a record that is meant to hold none.
export function cityDistrict(address: string | undefined): { city: string; district: string } {
  const parts = (address || "").trim().split(/\s+/);
  return {
    city: parts[0] ?? "",
    district: parts.find(p => /(구|시|군)$/.test(p) && p !== parts[0]) ?? "",
  };
}

export function queuedLead(item: NaverSearchResult): Partial<EnrichedLead> & { enrichment_status: EnrichmentStatus } {
  const signal = englishSignal(item);
  return {
    naver_id: getNaverId(item),
    institution_name_kr: stripHtml(item.title),
    institution_name_en: "",
    ...cityDistrict(item.roadAddress || item.address),
    address_full: item.roadAddress || item.address,
    phone: item.telephone,
    website: item.link || null,
    naver_raw: item,
    firebase_status: "not_contacted",
    english_signal: signal === "confirmed" ? "confirmed" : "unsure",
    needs_review: signal !== "confirmed",
    enrichment_status: "queued",
    queued_at: new Date().toISOString(),
  };
}

// A queued or failed lead has no enrichment to show, so it stays out of the
// working queues until the enrich cron has had a go at it.
export const isAwaitingEnrichment = (lead: Pick<EnrichedLead, "enrichment_status">) =>
  lead.enrichment_status === "queued" || lead.enrichment_status === "failed";

// mergeGrounded (rag/reenrich.ts) updates the fields a RE-enrichment changes,
// which assumes the lead was enriched once already. A queued lead never was:
// it holds the Korean district off the address and no English name or type at
// all. These are the fields that first pass has to fill in.
const FIRST_ENRICHMENT_FIELDS = [
  "institution_name_en", "institution_name_kr", "institution_type", "city", "district",
  "address_full", "phone", "website", "instagram", "director_name",
  "english_signal", "needs_review",
] as const;

export function firstEnrichmentUpdate(grounded: EnrichedLead, manualFields: string[] = []): Record<string, unknown> {
  const manual = new Set(manualFields);
  const update: Record<string, unknown> = {};
  for (const field of FIRST_ENRICHMENT_FIELDS) {
    if (manual.has(field)) continue;
    const value = grounded[field];
    if (value !== undefined) update[field] = value;
  }
  return update;
}
