import { adminDb } from "../src/lib/firebaseAdmin.js";
import { searchNaver, enrichLeadServer } from "../src/lib/serverActions.js";
import { getNaverId, stripHtml } from "../src/lib/naverId.js";
import { isLikelyTarget } from "../src/lib/leadFilter.js";
import { LEADS } from "../src/lib/collections.js";
import { loadContactBlocklist } from "../src/lib/blocklist.js";
import { buildQueries } from "../src/lib/searchPlan.js";

// Runs the same search -> dedupe -> enrich -> save pipeline as the UI's
// "Bulk Sweep" button, unattended, on Vercel Cron (see vercel.json).
// Never sends anything — leads land in Firestore as not_contacted, same
// as a manual sweep; outreach is still a deliberate human action.
//
// A Vercel serverless function has a hard execution ceiling (60s on
// Hobby, this project's plan — see maxDuration in vercel.json). The UI's
// Bulk Sweep button doesn't hit this because its loop runs in the
// browser tab, issuing many short-lived API calls; here the whole loop
// is one invocation, so scope has to fit in 60s. QUERIES_PER_RUN=2 was
// the first attempt, sized against *failed* enrich calls (fast
// RESOURCE_EXHAUSTED responses) during testing — timed out at exactly
// 60s once real enrichment succeeded, since a real Gemini call runs
// several seconds, not milliseconds. QUERIES_PER_RUN=1 (up to 5 results)
// is sized against real per-item latency instead, rotating through the
// list one query at a time via a cursor stored in Firestore — covering
// the full matrix over ~10 days rather than attempting a bigger scope
// per run.
//
// TODO: the cron stays on baseline enrichment. Moving it to grounded mode is
// a separate step: collecting sources plus enriching won't fit in one 60s
// invocation, so it needs to queue collection and enrichment as their own
// jobs, not block on them here (see scripts/enrich-grounded.ts for the batch
// path).
//
// Queries come from src/lib/searchPlan.ts — one per 동, not per 구, because
// Naver Local returns only a top 5 per query. The cursor rotates through the
// whole list, which is now ~150 queries, so a full pass takes months at one
// query per run. Raising QUERIES_PER_RUN is step 8's job, not a constant to
// bump here without checking it against the 60s limit.
const QUERIES = buildQueries();
const QUERIES_PER_RUN = 1;
const CURSOR_DOC = "config/cron_sweep";

export default async function handler(req: any, res: any) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = adminDb();
  const cursorRef = db.doc(CURSOR_DOC);
  const cursorSnap = await cursorRef.get();
  const startIndex = (cursorSnap.data()?.nextIndex ?? 0) % QUERIES.length;
  const todaysQueries = Array.from({ length: QUERIES_PER_RUN }, (_, i) => QUERIES[(startIndex + i) % QUERIES.length]);

  const existing = await db.collection(LEADS).select().get();
  const seen = new Set(existing.docs.map(d => d.id));
  // Academies already contacted (or thrown out) under the old pipeline. They
  // live in the legacy collection, so deduping against leads_v2 alone would
  // re-add them.
  const blocklist = await loadContactBlocklist(db);

  const stats = { queriesRun: 0, saved: 0, skipped: 0, blocked: 0, filtered: 0, failed: 0 };
  const log: string[] = [];

  // One page per query: Naver Local Search has no usable paging, so start=6
  // returns nothing new. Breadth comes from more neighbourhoods, not deeper
  // pages.
  for (const q of todaysQueries) {
    let data: any;
    try {
      data = await searchNaver(q, 1);
    } catch (err: any) {
      log.push(`Search failed for "${q}": ${err.message}`);
      continue;
    }

    for (const item of data.items || []) {
      const naverId = getNaverId(item);
      if (seen.has(naverId)) {
        stats.skipped++;
        continue;
      }
      seen.add(naverId);
      if (blocklist.has(naverId)) {
        stats.blocked++;
        log.push(`Blocked: ${stripHtml(item.title)} (contacted or removed under the old pipeline)`);
        continue;
      }
      // Cheap category/title check first — don't spend a Gemini call on
      // adult test-prep schools or non-schools.
      if (!isLikelyTarget(item)) {
        stats.filtered++;
        log.push(`Filtered: ${stripHtml(item.title)} (${item.category})`);
        continue;
      }
      try {
        const enriched = await enrichLeadServer(item);
        await db.collection(LEADS).doc(enriched.naver_id).set({ ...enriched, saved_at: new Date().toISOString() });
        stats.saved++;
        log.push(`Saved: ${stripHtml(item.title)}`);
      } catch (err: any) {
        stats.failed++;
        log.push(`Failed: ${stripHtml(item.title)} — ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 400));
    }
    stats.queriesRun++;
    await new Promise(r => setTimeout(r, 300));
  }

  await cursorRef.set({ nextIndex: (startIndex + QUERIES_PER_RUN) % QUERIES.length, lastRunAt: new Date().toISOString() });

  console.log("cron-sweep", JSON.stringify({ queries: todaysQueries, ...stats, log }));
  res.json({ ok: true, queries: todaysQueries, ...stats });
}
