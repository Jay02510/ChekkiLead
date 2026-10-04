// Pure helpers for eval/coverage.ts.
import { normalizeUrl } from "../src/lib/rag/collect";

// Is at least one gold source URL among the collected URLs? Compared after
// normalising protocol, www./m. prefixes and trailing slashes.
export function urlHit(goldUrls: string[], collectedUrls: string[]): boolean {
  const collected = new Set(collectedUrls.map(normalizeUrl));
  return goldUrls.some(u => collected.has(normalizeUrl(u)));
}

export function emailHit(goldEmail: string, candidates: { email: string }[]): boolean {
  const want = goldEmail.trim().toLowerCase();
  return candidates.some(c => c.email.trim().toLowerCase() === want);
}
