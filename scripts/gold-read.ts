// Reading aid for hand-checking eval/gold.json. Prints the snapshot text
// around the words that answer the four gold fields, instead of the whole
// page — a kindergarten site is mostly navigation and mission statement, and
// 24 leads of that is why the gold set sat unchecked.
//
//   npx tsx scripts/gold-read.ts              list every lead, checked or not
//   npx tsx scripts/gold-read.ts 여나           one lead, by name or naver_id
//   npx tsx scripts/gold-read.ts 여나 --full    every source's full text
//
// It never writes. It suggests nothing: the windows are quotes from the
// source, and what goes in gold.json is your reading of them.
import fs from "node:fs";
import path from "node:path";

interface GoldEntry {
  naver_id: string;
  name_kr: string;
  naver_link?: string;
  checked: boolean;
  gold: { age_min: unknown; age_max: unknown; cefr_levels: unknown; email: unknown; hook_fact: unknown };
}
interface Source { type: string; url: string; status: string; text?: string; title?: string }

const GOLD = "eval/gold.json";
const full = process.argv.includes("--full");
const query = process.argv.slice(2).find(a => !a.startsWith("--"));

// What each gold field is likely to be stated next to, on a Korean
// kindergarten or academy page.
const PATTERNS: Record<string, RegExp> = {
  age: /만\s?\d\s?세|\d\s?~\s?\d\s?세|\d세반|연령|나이|유아반|유치부|\d세\s?아동/g,
  levels: /CEFR|\bA1\b|\bA2\b|\bB1\b|파닉스|phonics|레벨|level|단계/gi,
  email: /[\w.+-]+@[\w-]+\.[\w.]+/g,
  // Deliberately not 프로그램 or 교육과정: every school's mission statement
  // contains both, so they match the boilerplate and nothing else.
  hook: /원어민|이머전|immersion|영어\s?(수업|교육|활동)|특별활동|방과\s?후|체험\s?학습|견학|발표회|운동회/g,
};

// ±90 characters around each hit, with overlapping windows merged, so a
// paragraph that mentions ages three times prints once.
function windows(text: string, re: RegExp): string[] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(re)) {
    const start = Math.max(0, m.index - 90);
    const end = Math.min(text.length, m.index + m[0].length + 90);
    const last = spans[spans.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  // Kindergarten sites repeat the same paragraph in the header, the hero and
  // the footer, so identical windows collapse to one.
  return [...new Set(spans.map(([s, e]) => text.slice(s, e).replace(/\s+/g, " ").trim()))];
}

const entries: GoldEntry[] = JSON.parse(fs.readFileSync(GOLD, "utf8"));

if (!query) {
  console.log(`${entries.length} leads in ${GOLD}\n`);
  for (const e of entries) {
    const f = fs.existsSync(path.join("eval/sources", `${e.naver_id}.json`));
    console.log(`  ${e.checked ? "[x]" : "[ ]"} ${e.name_kr.padEnd(22)} ${e.naver_id.padEnd(14)} ${f ? "" : "no snapshot"}`);
  }
  console.log(`\n${entries.filter(e => e.checked).length} checked. Next: npx tsx scripts/gold-read.ts <name>`);
  process.exit(0);
}

const entry = entries.find(e => e.naver_id === query || e.name_kr.includes(query));
if (!entry) throw new Error(`No gold entry matching "${query}". Run without arguments to list them.`);

const snapPath = path.join("eval/sources", `${entry.naver_id}.json`);
if (!fs.existsSync(snapPath)) throw new Error(`No snapshot at ${snapPath}. Run eval/snapshot-sources.ts first.`);
const snap: { sources: Source[]; candidate_emails?: { email: string; sourceType: string }[] } = JSON.parse(fs.readFileSync(snapPath, "utf8"));

console.log(`${entry.name_kr}  (${entry.naver_id})`);
console.log(`site     ${entry.naver_link || "(none)"}`);
console.log(`checked  ${entry.checked}`);
console.log(`gold     age ${entry.gold.age_min ?? "null"}-${entry.gold.age_max ?? "null"}, levels ${JSON.stringify(entry.gold.cefr_levels)}, email ${JSON.stringify(entry.gold.email)}`);
console.log(`hook     ${JSON.stringify(entry.gold.hook_fact)}\n`);

const own = snap.sources.filter(s => s.type === "blog_own" || s.type === "website");
console.log(`${snap.sources.length} sources (${own.length} their own). Only their own pages can answer the email field.\n`);

for (const s of snap.sources) {
  const chars = s.text?.length ?? 0;
  console.log(`--- ${s.type}  ${s.url}`);
  console.log(`    ${s.status}, ${chars} chars${s.title ? `, "${s.title}"` : ""}`);
  if (!s.text) { console.log(""); continue; }
  if (full) { console.log(s.text, "\n"); continue; }
  for (const [field, re] of Object.entries(PATTERNS)) {
    const hits = windows(s.text, re);
    if (!hits.length) continue;
    console.log(`  ${field}:`);
    for (const h of hits.slice(0, 6)) console.log(`    … ${h} …`);
    if (hits.length > 6) console.log(`    (${hits.length - 6} more — use --full)`);
  }
  console.log("");
}

if (snap.candidate_emails?.length) {
  console.log("candidate emails found in the text:");
  for (const c of snap.candidate_emails) console.log(`  ${c.email}  (${c.sourceType})`);
  console.log("A third-party source is not proof of their address — a web-design vendor's footer looks the same.\n");
}

console.log(`Write your answers into ${GOLD} under "${entry.naver_id}". "not_found" means you looked and nothing is published; null means you haven't looked.`);
