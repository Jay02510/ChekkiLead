// Pure scoring helpers for eval/run.ts.
import type { EnrichedLead, GroundedFact } from "../src/types";

// A gold field is null until the human has looked. "not_found" means they
// looked and nothing is published — a pipeline that still returns a value
// there is inventing it.
export const NOT_FOUND = "not_found" as const;
export const isNotFound = (v: unknown): v is typeof NOT_FOUND => v === NOT_FOUND;

export type ClaimField = "age" | "levels" | "email" | "hook";

// The grounded fact behind a field, when the lead was enriched from sources.
export function factFor(field: Exclude<ClaimField, "email">, out: EnrichedLead | null): GroundedFact | undefined {
  const f = out?.facts;
  if (!f) return undefined;
  return { age: f.age_range, levels: f.cefr_levels, hook: f.hook }[field] as GroundedFact;
}

// Did the pipeline output assert a value for this field? A failed
// enrichment (out === null) asserts nothing. An estimated email is a
// claim — it presents a guessed address as the lead's contact.
export function claimsValue(field: ClaimField, out: EnrichedLead | null): boolean {
  if (!out) return false;
  // Grounded leads claim a value only when a fact survived verification;
  // "inferred" counts as a claim (reported separately).
  if (field !== "email") {
    const fact = factFor(field, out);
    if (fact) return fact.status !== "not_found";
  }
  switch (field) {
    case "age": return parseAgeRange(out.student_age_range) !== null;
    case "levels": return (out.cefr_levels_taught?.length ?? 0) > 0;
    case "email": return !!out.email?.trim() && out.email_confidence !== "unknown";
    case "hook": return !!out.personalization_hook?.trim();
  }
}

// "5–12 years" -> [5, 12]; "7 years" -> [7, 7]; nothing parseable -> null.
export function parseAgeRange(s: string | undefined): [number, number] | null {
  const nums = (s || "").match(/\d+/g)?.map(Number);
  if (!nums?.length) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

// Interval overlap / union. A single-age range counts as width 1 so an
// exact single-age match scores 1, not 0/0.
export function ageIoU(predicted: [number, number] | null, gold: [number, number]): number {
  if (!predicted) return 0;
  const overlap = Math.max(0, Math.min(predicted[1], gold[1]) - Math.max(predicted[0], gold[0]) + 1);
  const union = Math.max(predicted[1], gold[1]) - Math.min(predicted[0], gold[0]) + 1;
  return overlap / union;
}

export function jaccard(a: string[] | undefined, b: string[]): number {
  const A = new Set(a || []);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  const intersection = [...A].filter(x => B.has(x)).length;
  return intersection / new Set([...A, ...B]).size;
}

export function sameEmail(a: string | undefined, b: string): boolean {
  return (a || "").trim().toLowerCase() === b.trim().toLowerCase();
}

// ---------- grounded-mode metrics ----------

// Facts the model cited before verification: those that survived plus those
// verifyFacts threw away. Failure rate = thrown away / cited.
export function citedFactCounts(out: EnrichedLead | null): { cited: number; failed: number; inferred: number } {
  if (!out?.facts || !out.grounding) return { cited: 0, failed: 0, inferred: 0 };
  const list = [out.facts.age_range, out.facts.approx_students, out.facts.cefr_levels, out.facts.hook];
  const kept = list.filter(f => f.status !== "not_found");
  return {
    cited: kept.length + out.grounding.verification_failures,
    failed: out.grounding.verification_failures,
    inferred: kept.filter(f => f.status === "inferred").length,
  };
}

// Does the source a fact cites match one the human listed as proof?
// null when it can't be judged (nothing cited, or the human listed no URL).
export function citedSourceAgrees(fact: GroundedFact | undefined, goldUrls: string[] | undefined, same: (a: string[], b: string[]) => boolean): boolean | null {
  if (!fact?.source_url || !goldUrls?.length) return null;
  return same(goldUrls, [fact.source_url]);
}

export const rate = (hit: number, total: number) => (total ? hit / total : NaN);
