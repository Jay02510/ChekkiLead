// Collects public text about each lead (blog posts, its own site/blog) and
// stores it under {collection}/{naver_id}/sources. Does not touch enrichment.
// Runs on the active collection, or on the legacy one with --gold.
//
//   npx tsx scripts/collect-sources.ts [--limit N] [--gold] [--force] [--write]
//
//   --limit N  stop after N leads
//   --gold     only leads listed in eval/gold.json
//   --force    re-collect even if collected in the last 30 days
//   --write    save to Firestore (default is a dry run that prints what it found)
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";
import { adminDb } from "../src/lib/firebaseAdmin";
import { collectForLead, isOwnSourceEmail, type CollectResult } from "../src/lib/rag/collect";
import { saveSources } from "../src/lib/rag/store";
import { LEADS, LEGACY_LEADS } from "../src/lib/collections";
import type { EnrichedLead } from "../src/types";

const args = process.argv.slice(2);
const write = args.includes("--write");
const force = args.includes("--force");
const goldOnly = args.includes("--gold");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
if (limitIdx >= 0 && !(limit > 0)) throw new Error("--limit needs a positive number.");

const RECENT_MS = 30 * 24 * 3600 * 1000;
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "n/a");
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const db = adminDb();
  // The gold set is sampled from the old collection and stays there, so
  // --gold reads and writes LEGACY_LEADS; normal runs use the active one.
  const collectionName = goldOnly ? LEGACY_LEADS : LEADS;
  const snap = await db.collection(collectionName).get();
  const goldIds = goldOnly ? new Set<string>(JSON.parse(readFileSync("eval/gold.json", "utf8")).map((e: any) => e.naver_id)) : null;

  const skipped = { nonTarget: 0, deleted: 0, optedOut: 0, recent: 0, notGold: 0 };
  const todo: EnrichedLead[] = [];
  for (const d of snap.docs) {
    const lead = d.data() as EnrichedLead;
    if (lead.deleted) { skipped.deleted++; continue; }
    if (lead.non_target) { skipped.nonTarget++; continue; }
    if (lead.firebase_status === "opted_out") { skipped.optedOut++; continue; }
    if (goldIds && !goldIds.has(lead.naver_id)) { skipped.notGold++; continue; }
    if (!force && lead.sources_collected_at && Date.now() - Date.parse(lead.sources_collected_at) < RECENT_MS) { skipped.recent++; continue; }
    todo.push(lead);
  }
  const batch = todo.slice(0, limit);
  console.log(`${snap.size} leads in ${collectionName}; collecting for ${batch.length}${write ? "" : " (dry run — nothing is written)"}. Skipped: ${JSON.stringify(skipped)}\n`);

  const results: { lead: EnrichedLead; result: CollectResult }[] = [];
  for (const lead of batch) {
    const result = await collectForLead(lead);
    results.push({ lead, result });
    const c = result.counts;
    console.log(`${lead.institution_name_kr}: own ${c.blog_own}, third-party ${c.blog_third_party}, site ${c.website}, errors ${c.errors}, emails ${result.candidate_emails.map(e => `${e.email}${isOwnSourceEmail(e) ? "" : " (third-party)"}`).join(", ") || "-"}`);
    for (const s of result.sources.filter(s => s.status === "error")) console.log(`    error ${s.error}  ${s.url}`);
    if (write) await saveSources(db, lead.naver_id, result, collectionName);
  }

  // Coverage report
  const usable = (r: CollectResult) => r.sources.some(s => s.status === "ok" && s.text.length > 0);
  const chunkCounts = results.map(({ result }) => result.sources.filter(s => s.status === "ok").reduce((n, s) => n + s.chunks.length, 0));
  // Unsupported hosts (Instagram, YouTube, Kakao ...) were never fetched, so
  // they're reported separately from real fetch failures.
  const pageSources = results.flatMap(({ result }) => result.sources.filter(s => s.via === "page"));
  const unsupported = pageSources.filter(s => s.error?.startsWith("unsupported"));
  const pageAttempts = pageSources.filter(s => !s.error?.startsWith("unsupported"));
  const pageErrors = pageAttempts.filter(s => s.status === "error");
  const byReason: Record<string, number> = {};
  for (const s of pageErrors) {
    const reason = (s.error || "unknown").split(":")[0];
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  const unsupportedByHost: Record<string, number> = {};
  for (const s of unsupported) unsupportedByHost[s.error!] = (unsupportedByHost[s.error!] || 0) + 1;

  console.log(`
Coverage over ${results.length} leads${write ? "" : " (dry run)"}
  at least one usable source   ${pct(results.filter(r => usable(r.result)).length, results.length)}
  at least one blog_own source ${pct(results.filter(r => r.result.counts.blog_own > 0).length, results.length)}
  candidate email, own source  ${pct(results.filter(r => r.result.candidate_emails.some(isOwnSourceEmail)).length, results.length)}
  candidate email, any source  ${pct(results.filter(r => r.result.candidate_emails.length > 0).length, results.length)}
  page fetch errors            ${pct(pageErrors.length, pageAttempts.length)}
${Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([r, n]) => `    ${r}: ${n}`).join("\n") || "    (none)"}
  not fetched (unsupported)    ${unsupported.length}${unsupported.length ? "  " + Object.entries(unsupportedByHost).map(([r, n]) => `${r.replace("unsupported_host:", "")} ${n}`).join(", ") : ""}
  median chunks per lead       ${median(chunkCounts)}`);
  if (!write) console.log("\nDry run. Re-run with --write to save.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
