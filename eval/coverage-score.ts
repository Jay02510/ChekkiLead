// Pure helpers for eval/coverage.ts.
import { normalizeUrl, isOwnSourceEmail } from "../src/lib/rag/collect";
import type { CandidateEmail } from "../src/types";

// Is at least one gold source URL among the collected URLs? Compared after
// normalising protocol, www./m. prefixes and trailing slashes.
export function urlHit(goldUrls: string[], collectedUrls: string[]): boolean {
  const collected = new Set(collectedUrls.map(normalizeUrl));
  return goldUrls.some(u => collected.has(normalizeUrl(u)));
}

// Only emails from the academy's own blog or website count; one found in a
// third-party post is probably the blogger's. Entries without a sourceType
// come from a snapshot taken before this rule and are not trusted.
export function emailHit(goldEmail: string, candidates: Pick<CandidateEmail, "email" | "sourceType">[]): boolean {
  const want = goldEmail.trim().toLowerCase();
  return candidates.some(c => c.sourceType && isOwnSourceEmail(c) && c.email.trim().toLowerCase() === want);
}
