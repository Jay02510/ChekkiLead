import { adminDb } from "../src/lib/firebaseAdmin.js";
import { searchNaver } from "../src/lib/serverActions.js";
import { getNaverId, stripHtml } from "../src/lib/naverId.js";
import { isLikelyTarget } from "../src/lib/leadFilter.js";
import { LEADS } from "../src/lib/collections.js";
import { loadContactBlocklist } from "../src/lib/blocklist.js";
import { buildQueries } from "../src/lib/searchPlan.js";
import { queuedLead } from "../src/lib/queue.js";

// Stage one of two: search Naver, save what it returned, enrich nothing.
// /api/cron-enrich drains the queue (see src/lib/queue.ts for why they are
// split). Never sends anything — leads land as not_contacted, same as a
// manual sweep; outreach is still a deliberate human action.
//
// With no Gemini call in the loop, a run costs about 600ms per query against
// the 60s ceiling (maxDuration in vercel.json), so the limit here is Naver
// politeness rather than time. 12 queries per run covers the 152-query search
// plan in under two weeks; the cursor in Firestore rotates through the list.
const QUERIES = buildQueries();
const QUERIES_PER_RUN = 12;
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

  const stats = { queriesRun: 0, queued: 0, skipped: 0, blocked: 0, filtered: 0 };
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
      // Keeps the queue clean rather than saving a Gemini call: nothing here
      // enriches, but a non-school shouldn't take up a queue slot either.
      if (!isLikelyTarget(item)) {
        stats.filtered++;
        log.push(`Filtered: ${stripHtml(item.title)} (${item.category})`);
        continue;
      }
      const queued = queuedLead(item);
      await db.collection(LEADS).doc(naverId).set({ ...queued, saved_at: new Date().toISOString() });
      stats.queued++;
      log.push(`Queued: ${stripHtml(item.title)}`);
    }
    stats.queriesRun++;
    await new Promise(r => setTimeout(r, 300));
  }

  await cursorRef.set({ nextIndex: (startIndex + QUERIES_PER_RUN) % QUERIES.length, lastRunAt: new Date().toISOString() });

  console.log("cron-sweep", JSON.stringify({ queries: todaysQueries, ...stats, log }));
  res.json({ ok: true, queries: todaysQueries, ...stats });
}
