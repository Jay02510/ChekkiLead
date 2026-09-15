import { NaverSearchResult } from '../types';

/**
 * Naver's Local Search API does NOT return a stable unique ID for a place —
 * only title/address/phone/link. The original code assumed `result.id`
 * existed and used it for dedupe; that field never existed on
 * NaverSearchResult, so the "already saved" check silently always failed.
 *
 * This derives a deterministic key so the same real-world business always
 * maps to the same string, whether you find it via one search query or ten.
 * Priority: embedded Naver place id in the link > normalized phone number >
 * hash of name+address (last resort, still deterministic).
 */

export function stripHtml(s: string | undefined | null): string {
  return (s || '').replace(/<[^>]*>/g, '');
}

function normalizePhone(phone: string | undefined | null): string {
  return (phone || '').replace(/\D/g, '');
}

// djb2 — fine for a dedupe key, not for anything security-sensitive.
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function extractNaverPlaceId(link: string | undefined | null): string | null {
  if (!link) return null;
  const match = link.match(/place\/(\d+)/);
  return match ? `place_${match[1]}` : null;
}

export function getNaverId(result: NaverSearchResult): string {
  const fromLink = extractNaverPlaceId(result.link);
  if (fromLink) return fromLink;

  const phone = normalizePhone(result.telephone);
  if (phone.length >= 8) return `phone_${phone}`;

  const name = stripHtml(result.title).trim();
  const addr = (result.roadAddress || result.address || '').trim();
  return `hash_${hashString(`${name}|${addr}`)}`;
}
