// Server-only source collection for retrieval-grounded enrichment (Phase 1).
// Gathers the public text about one academy — blog posts about it, its own
// site/blog — and splits it into chunks later phases can cite. It never
// touches enrichment; its only output is stored text plus candidate emails.
import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { stripHtml } from "../naverId.js";
import type { EnrichedLead } from "../../types";

export type SourceType = "blog_own" | "blog_third_party" | "website";
export type FetchLike = typeof fetch;

export interface BlogPost {
  title: string;
  description: string;
  link: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
}

export interface Chunk {
  id: string;
  text: string;
}

export interface Source {
  id: string;
  url: string;
  type: SourceType;
  title: string;
  postdate: string | null;
  // search = a Naver blog search snippet; page = a URL we fetched ourselves.
  via: "search" | "page";
  status: "ok" | "error";
  error: string | null;
  text: string;
  chunks: Chunk[];
  emails: string[];
  fetched_at: string;
}

export type CollectLead = Pick<EnrichedLead, "institution_name_kr" | "district" | "address_full" | "website" | "naver_raw">;

const MIN_RELEVANT_POSTS = 5;
const MAX_PAGE_BYTES = 500 * 1024;
const FETCH_TIMEOUT_MS = 8000;
// Keeps a source plus its chunks under Firestore's 1 MiB document limit (Korean is 3 bytes/char).
const MAX_TEXT_CHARS = 100_000;
const USER_AGENT = "ChekkiLeadBot/1.0 (+https://chekki-lead.vercel.app; academy research for outreach)";

export const sourceIdFor = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 10);

// ---------- relevance ----------

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const BRANCH_SUFFIX = /(점|캠퍼스|센터|직영|본관|별관)$/;
const AREA_SUFFIX = /[구시동읍면군로길]$/;

// Words naming the kind of school, not the school. Longest first so
// "영어유치원" is stripped before "유치원".
const GENERIC_TYPES = ["영어유치원", "영어학원", "어린이집", "교습소", "공부방", "어학원", "유치원", "학원"];
const stripGeneric = (token: string) => {
  const g = GENERIC_TYPES.find(w => token.endsWith(w));
  return g ? token.slice(0, -g.length) : token;
};

const districtStemOf = (district: string) => district.replace(AREA_SUFFIX, "");

// The academy's everyday name as tokens: branch words, the lead's own
// district and generic school-type words (whole or as a suffix) removed.
// "랜퍼스 키즈잉글리쉬 어학원 송파" -> ["랜퍼스", "키즈잉글리쉬"].
function nameTokens(nameKr: string, district: string): string[] {
  const districtStem = districtStemOf(district);
  return stripHtml(nameKr)
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !BRANCH_SUFFIX.test(t) && !(districtStem && t === districtStem))
    .map(stripGeneric)
    .filter(Boolean);
}

// Everyday name, spaces removed, lowercased: "OTP영어학원" -> "otp",
// "해커스어학원 강남역캠퍼스 본관" -> "해커스". Falls back to the full name
// when everything would be dropped.
export function coreName(nameKr: string, district = ""): string {
  const tokens = nameTokens(nameKr, district);
  return norm(tokens.length ? tokens.join("") : stripHtml(nameKr));
}

// A core this short ("otp", "컬컴") appears in unrelated posts, so a post must
// also name one of the lead's own areas to count.
const isShortCore = (core: string) => core.length < 3 || (/^[a-z]+$/.test(core) && core.length <= 3);

// Areas a same-named academy in another city would mention. Deliberately
// excludes 서울/성남 — too broad to tell a branch from the wrong branch.
const KNOWN_AREAS = [
  "강남", "서초", "송파", "마포", "분당", "판교", "잠실", "홍대", "신촌", "대치", "목동", "일산", "수원", "용인",
  "부산", "대구", "인천", "대전", "광주", "울산", "강동", "강서", "양천", "노원", "종로", "용산", "성동", "광진",
  "동작", "관악", "영등포", "구로", "서대문", "은평", "중랑", "동대문", "성북", "강북", "도봉", "금천", "평촌",
  "동탄", "하남", "김포", "고양", "안양", "부천", "천안", "청주", "제주", "세종", "창원", "전주", "포항",
];

// Province-level words appear in too many unrelated posts to prove a match.
const BROAD_AREA = /^(서울|서울특별|경기|경기도|.+광역|.+특별자치)$/;

function ownAreaStems(lead: CollectLead): string[] {
  return `${lead.district || ""} ${lead.address_full || ""}`
    .split(/\s+/)
    .map(t => t.replace(AREA_SUFFIX, ""))
    .filter(t => t.length >= 2);
}

// Keep a post only if the academy's core name appears in its title or
// description. A match that also names a *different* known area and none of
// the lead's own areas is a same-name academy elsewhere — dropped. A post
// that names no area at all is ambiguous and kept — except for very short
// names, which must name one of the lead's own areas.
export function isRelevantPost(post: Pick<BlogPost, "title" | "description">, lead: CollectLead): boolean {
  const text = norm(`${post.title} ${post.description}`);
  const core = coreName(lead.institution_name_kr, lead.district);
  if (!core || !text.includes(core)) return false;

  const own = ownAreaStems(lead);
  if (isShortCore(core)) return own.filter(o => !BROAD_AREA.test(o)).some(o => text.includes(o));
  const mentioned = KNOWN_AREAS.filter(a => text.includes(a));
  if (mentioned.length === 0) return true;
  return mentioned.some(a => own.some(o => o.includes(a) || a.includes(o)));
}

// ---------- URL handling ----------

const UNSUPPORTED_HOST = /(^|\.)(instagram\.com|youtube\.com|youtu\.be|kakao\.com|booking\.naver\.com|naver\.me)$/i;

function parseUrl(url: string): URL | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
}

// Returns why a URL shouldn't be fetched, or null if it can be.
export function unsupportedReason(url: string): string | null {
  const u = parseUrl(url);
  if (!u || !/^https?:$/.test(u.protocol)) return "unsupported_url";
  const m = u.hostname.match(UNSUPPORTED_HOST);
  return m ? `unsupported_host:${m[2].toLowerCase()}` : null;
}

// blog.naver.com keeps post content in an iframe on desktop; the mobile
// host serves it inline.
export function toMobileBlogUrl(url: string): string {
  const u = parseUrl(url);
  if (!u || u.hostname !== "blog.naver.com") return url;
  u.hostname = "m.blog.naver.com";
  return u.toString();
}

// "m.blog.naver.com/abc/123?x" -> "blog.naver.com/abc/123"; used to compare
// URLs across m./www. prefixes and trailing slashes.
export function normalizeUrl(url: string): string {
  const u = parseUrl(url.trim());
  if (!u) return url.trim().toLowerCase();
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${path}${u.search}`;
}

function naverBlogId(url: string): string | null {
  const u = parseUrl(url);
  if (!u || !/(^|\.)blog\.naver\.com$/.test(u.hostname)) return null;
  const fromQuery = u.searchParams.get("blogId");
  return (fromQuery || u.pathname.split("/").filter(Boolean)[0] || "").toLowerCase() || null;
}

// blog_own: the blogger is the academy's own blog (matches the Naver
// listing's link, or the blog's name contains the academy's core name).
// Anything else that passed the relevance filter is third-party.
export function classifyBlogPost(post: BlogPost, lead: CollectLead): SourceType {
  const ownId = lead.naver_raw?.link ? naverBlogId(lead.naver_raw.link) : null;
  const postId = naverBlogId(post.bloggerlink) || naverBlogId(post.link);
  if (ownId && postId && ownId === postId) return "blog_own";
  const core = coreName(lead.institution_name_kr, lead.district);
  if (core && !isShortCore(core) && norm(stripHtml(post.bloggername)).includes(core)) return "blog_own";
  return "blog_third_party";
}

// ---------- Naver blog search ----------

// Real posts use the everyday name ("랜퍼스 키즈잉글리쉬 송파"), not the full
// listing title, so that is the primary query. The quoted full name is the
// fallback when the primary finds too little.
export function blogQueries(lead: Pick<CollectLead, "institution_name_kr" | "district">): { primary: string; fallback: string } {
  const full = stripHtml(lead.institution_name_kr);
  const district = lead.district || "";
  const stem = districtStemOf(district);
  const tokens = nameTokens(full, district);
  const primary = [tokens.length ? tokens.join(" ") : full, stem.length >= 2 ? stem : ""].filter(Boolean).join(" ");
  return { primary, fallback: `"${full}" ${district}`.trim() };
}

export async function searchNaverBlogs(query: string, fetchImpl: FetchLike = fetch): Promise<BlogPost[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Naver API credentials not configured.");

  const res = await fetchImpl(`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=30&sort=sim`, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
  });
  if (!res.ok) throw new Error(`Naver blog search responded with ${res.status}`);
  const data: any = await res.json();
  return (data.items || []).map((it: any) => ({
    title: stripHtml(it.title).trim(),
    description: stripHtml(it.description).trim(),
    link: it.link,
    bloggername: stripHtml(it.bloggername).trim(),
    bloggerlink: it.bloggerlink,
    postdate: it.postdate,
  }));
}

// ---------- page fetch ----------

export function classifyFetchError(err: any): string {
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return "timeout";
  const code = String(err?.cause?.code || err?.code || "");
  if (/CERT|SELF_SIGNED|TLS|SSL/i.test(code) || /certificate|SSL|TLS/i.test(String(err?.message || "") + String(err?.cause?.message || ""))) return "certificate";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  return "network";
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    // Many Korean sites are EUC-KR with the charset only in a <meta> tag.
    charset = /charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(bytes.slice(0, 2048)))?.[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const p of parts) {
    const slice = p.slice(0, out.length - offset);
    out.set(slice, offset);
    offset += slice.length;
    if (offset >= out.length) break;
  }
  return out;
}

export interface FetchedPage {
  text: string;
  title: string;
  emails: string[];
}

// Throws an Error whose message is the failure reason (http_403, timeout,
// certificate, empty_page, ...), so callers can store it on an error source.
export async function fetchPage(url: string, fetchImpl: FetchLike = fetch): Promise<FetchedPage> {
  const unsupported = unsupportedReason(url);
  if (unsupported) throw new Error(unsupported);

  let res: Response;
  try {
    res = await fetchImpl(toMobileBlogUrl(url), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (err) {
    throw new Error(classifyFetchError(err));
  }
  if (!res.ok) throw new Error(`http_${res.status}`);

  let html: string;
  try {
    html = decodeBody(await readCapped(res, MAX_PAGE_BYTES), res.headers.get("content-type") || "");
  } catch (err) {
    throw new Error(classifyFetchError(err));
  }

  const root = parse(html);
  const mailtos = root
    .querySelectorAll("a[href^='mailto:']")
    .map(a => a.getAttribute("href") || "")
    .join(" ");
  const title = root.querySelector("title")?.text.trim() || "";
  root.querySelectorAll("script, style, nav, noscript").forEach(n => n.remove());
  const text = root.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
  if (text.length < 50) throw new Error("empty_page");

  return { text, title, emails: extractEmails(`${text} ${mailtos}`) };
}

// ---------- emails ----------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const FILE_TLD = /\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js|woff2?|ttf|mp4)$/i;
const PLACEHOLDER_DOMAIN = /^(example|domain|email|yourdomain|yoursite|test|sentry|wixpress)\./i;
const PLACEHOLDER_LOCAL = /^(your|name|user|username|email|test|example|id)$/i;

// Finds email addresses in text, including percent-encoded mailto links
// ("mailto:a%40b.kr") and HTML-entity @ signs. Drops image filenames like
// "icon@2x.png" and obvious placeholders. Order of first appearance kept.
export function extractEmails(text: string): string[] {
  const decoded = text
    .replace(/mailto:([^\s"'<>]+)/gi, (_, addr) => {
      try {
        return ` ${decodeURIComponent(addr).split("?")[0]} `;
      } catch {
        return ` ${addr} `;
      }
    })
    .replace(/&#0*64;|&#x0*40;|&commat;/gi, "@");

  const out: string[] = [];
  for (const raw of decoded.match(EMAIL_RE) || []) {
    const email = raw.replace(/^[.%+-]+|[.]+$/g, "").toLowerCase();
    const [local, domain] = email.split("@");
    if (!local || !domain) continue;
    if (FILE_TLD.test(domain) || PLACEHOLDER_DOMAIN.test(domain) || PLACEHOLDER_LOCAL.test(local)) continue;
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

// ---------- chunking ----------

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

// Page text -> ~800-char chunks with 100 chars of overlap, ending at a
// sentence boundary (., !, ?) when one falls in the back half of the window.
// Chunk ids are `${sourceId}#${n}`. Short text (blog snippets) is one chunk.
export function chunk(text: string, sourceId: string): Chunk[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [{ id: `${sourceId}#0`, text: clean }];

  const chunks: Chunk[] = [];
  let pos = 0;
  while (pos < clean.length) {
    let end = Math.min(pos + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const window = clean.slice(pos, end);
      let best = -1;
      for (const m of window.matchAll(/[.!?](?=\s|$)/g)) best = m.index! + 1;
      if (best >= CHUNK_SIZE / 2) end = pos + best;
    }
    chunks.push({ id: `${sourceId}#${chunks.length}`, text: clean.slice(pos, end).trim() });
    if (end >= clean.length) break;
    pos = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// ---------- per-lead collection ----------

export interface CollectResult {
  sources: Source[];
  counts: { blog_own: number; blog_third_party: number; website: number; errors: number };
  candidate_emails: { email: string; sourceId: string }[];
}

export interface CollectDeps {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function collectForLead(lead: CollectLead, deps: CollectDeps = {}): Promise<CollectResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? (() => new Date().toISOString());
  const sources = new Map<string, Source>();

  const add = (s: Omit<Source, "id" | "fetched_at" | "chunks"> & { chunks?: Chunk[] }) => {
    const id = sourceIdFor(normalizeUrl(s.url));
    if (sources.has(id)) return;
    sources.set(id, { ...s, id, fetched_at: now(), chunks: s.chunks ?? chunk(s.text, id) });
  };

  // 1. Blog posts about the academy — snippets only, one chunk each. At most
  // two Naver calls: the everyday name, then the full name if that finds
  // fewer than MIN_RELEVANT_POSTS relevant posts. Merged by URL.
  const { primary, fallback } = blogQueries(lead);
  const relevant = new Map<string, BlogPost>();
  let attempted = 0;
  let failed = 0;
  let lastError = "";
  for (const query of primary === fallback ? [primary] : [primary, fallback]) {
    if (attempted > 0) {
      if (relevant.size >= MIN_RELEVANT_POSTS) break;
      await sleep(300);
    }
    attempted++;
    try {
      for (const post of await searchNaverBlogs(query, fetchImpl)) {
        const key = normalizeUrl(post.link);
        if (!relevant.has(key) && isRelevantPost(post, lead)) relevant.set(key, post);
      }
    } catch (err: any) {
      failed++;
      lastError = err.message;
    }
  }
  for (const post of relevant.values()) {
    const text = `${post.title}\n${post.description}`;
    const id = sourceIdFor(normalizeUrl(post.link));
    add({
      url: post.link, type: classifyBlogPost(post, lead), title: post.title, postdate: post.postdate || null, via: "search",
      status: "ok", error: null, text, emails: extractEmails(text),
      chunks: [{ id: `${id}#0`, text }],
    });
  }
  // Only a failure of every query is recorded; one that succeeded still gave results.
  if (failed === attempted) {
    add({ url: `naver-blog-search:${lead.institution_name_kr}`, type: "blog_third_party", title: "Naver blog search", postdate: null, via: "search", status: "error", error: `blog_search_failed: ${lastError}`, text: "", emails: [] });
  }
  await sleep(300);

  // 2. The academy's own pages: the link Naver lists, and any website we saved.
  const pageUrls = [lead.naver_raw?.link, lead.website].filter((u): u is string => !!u && u.trim().length > 0);
  for (const url of [...new Set(pageUrls)]) {
    const own = naverBlogId(url) !== null;
    const type: SourceType = own ? "blog_own" : "website";
    const unsupported = unsupportedReason(url);
    if (unsupported) {
      add({ url, type, title: "", postdate: null, via: "page", status: "error", error: unsupported, text: "", emails: [] });
      continue;
    }
    try {
      const page = await fetchPage(url, fetchImpl);
      add({ url, type, title: page.title, postdate: null, via: "page", status: "ok", error: null, text: page.text, emails: page.emails });
    } catch (err: any) {
      add({ url, type, title: "", postdate: null, via: "page", status: "error", error: err.message, text: "", emails: [] });
    }
    await sleep(500);
  }

  const all = [...sources.values()];
  const counts = {
    blog_own: all.filter(s => s.status === "ok" && s.type === "blog_own").length,
    blog_third_party: all.filter(s => s.status === "ok" && s.type === "blog_third_party").length,
    website: all.filter(s => s.status === "ok" && s.type === "website").length,
    errors: all.filter(s => s.status === "error").length,
  };
  const candidate_emails: { email: string; sourceId: string }[] = [];
  for (const s of all) {
    for (const email of s.emails) {
      if (!candidate_emails.some(c => c.email === email)) candidate_emails.push({ email, sourceId: s.id });
    }
  }
  return { sources: all, counts, candidate_emails };
}
