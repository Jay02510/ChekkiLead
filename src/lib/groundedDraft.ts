// Decides what an outreach email is allowed to open with, and checks in code
// that the draft actually used it.
//
// The hook is the one sentence that makes a cold email not look like a mail
// merge, and it is also the easiest thing for a model to invent. A draft may
// only open with a fact that came off the school's own page and survived quote
// verification, or one a person typed in themselves. Everything else means no
// draft — a generic opener is worse than no email, because sending it burns
// the one first impression this academy will ever get.
import type { EmailDraft, EnrichedLead, SourceType } from "../types";
import { normalizeQuote } from "./rag/ground.js";

// Where the hook came from. "manual" is a person's own words — no source URL
// and nothing to verify against, so it is trusted and recorded as such.
export type HookSourceType = SourceType | "manual";

export interface DraftHook {
  text: string;
  source_type: HookSourceType | null;
  source_url: string | null;
  quote: string | null;
}

// Manual entry wins: a person who typed a hook has read the page, which is
// more than the pipeline can claim. Then a verified grounded fact. An
// unverified or not_found fact is not a hook.
export function hookForDraft(lead: EnrichedLead): DraftHook | null {
  const manual = new Set(lead.manual_fields ?? []);
  if (manual.has("personalization_hook") && lead.personalization_hook?.trim()) {
    return { text: lead.personalization_hook.trim(), source_type: "manual", source_url: null, quote: null };
  }

  const fact = lead.facts?.hook;
  if (!fact || fact.status === "not_found" || !fact.value?.trim()) return null;
  // verification is null for a fact that was never checked, which is not the
  // same as one that passed.
  if (fact.verification !== "passed") return null;
  return {
    text: fact.value.trim(),
    source_type: fact.source_type,
    source_url: fact.source_url,
    quote: fact.quote,
  };
}

// Korean particles and filler that carry no identifying information: a draft
// that reuses only these has not reused the hook.
const STOPWORDS = new Set([
  "있습니다", "합니다", "하는", "있는", "그리고", "또한", "및", "등", "the", "and", "for", "with", "that", "this",
  "유치원", "학원", "어학원", "교습소", "수업", "아이", "아이들", "학생", "교육",
]);

// Content words of 2+ characters. Korean has no spaces inside a compound, so a
// word-level split is enough to tell a reused fact from a paraphrase.
export function hookTokens(text: string): string[] {
  return [...new Set(
    normalizeQuote(text).toLowerCase().split(/[^\p{L}\p{N}]+/u)
      .map(w => w.replace(/(을|를|이|가|은|는|에서|에게|에|의|과|와|도|로|으로)$/u, ""))
      .filter(w => w.length >= 2 && !STOPWORDS.has(w)),
  )];
}

// Did the draft open with the hook it was given? Checked against both bodies,
// because the fact may be stated in Korean and paraphrased in English.
// Half the content words, and never more than 3, is deliberately loose: the
// prompt asks for a natural sentence, not a quotation.
export function draftUsesHook(draft: Pick<EmailDraft, "body_korean" | "body_english">, hook: DraftHook): boolean {
  const tokens = hookTokens(hook.text);
  if (tokens.length === 0) return false;
  const body = normalizeQuote(`${draft.body_korean} ${draft.body_english}`).toLowerCase();
  const found = tokens.filter(t => body.includes(t)).length;
  return found >= Math.min(3, Math.ceil(tokens.length / 2));
}

// Told to the model as the only permitted opener. The quote is included when
// there is one so the sentence can be built from the school's own words.
export function hookInstruction(hook: DraftHook): string {
  const provenance = hook.source_type === "manual"
    ? "A person at Chekki verified this themselves."
    : `From the school's own ${hook.source_type} (${hook.source_url}).`;
  return [
    `## THE ONLY PERMITTED HOOK`,
    `Sentence 1 of both bodies must be built from this fact and nothing else:`,
    `  ${hook.text}`,
    hook.quote ? `Their own wording: "${hook.quote}"` : null,
    provenance,
    `Do not add any other specific claim about this school — no student numbers,`,
    `no ages, no programme names, no awards, nothing that is not in the fact above.`,
    `If the fact is too thin for a natural opener, still use it; do not substitute.`,
  ].filter(Boolean).join("\n");
}
