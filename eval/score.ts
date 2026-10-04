// Pure scoring helpers for eval/run.ts.
import type { EnrichedLead } from "../src/types";

// A gold field is null until the human has looked. "not_found" means they
// looked and nothing is published — a pipeline that still returns a value
// there is inventing it.
export const NOT_FOUND = "not_found" as const;
export const isNotFound = (v: unknown): v is typeof NOT_FOUND => v === NOT_FOUND;

export type ClaimField = "age" | "levels" | "email" | "hook";

// Did the pipeline output assert a value for this field? A failed
// enrichment (out === null) asserts nothing. An estimated email is a
// claim — it presents a guessed address as the lead's contact.
export function claimsValue(field: ClaimField, out: EnrichedLead | null): boolean {
  if (!out) return false;
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
