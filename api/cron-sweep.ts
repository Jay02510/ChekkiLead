import { adminDb } from "../src/lib/firebaseAdmin.js";
import { searchNaver, enrichLeadServer } from "../src/lib/serverActions.js";
import { getNaverId, stripHtml } from "../src/lib/naverId.js";

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
// ponytail: query list is a fixed constant, not a Firestore-backed
// settings UI — edit this array and redeploy to change targets. Add a
// settings doc/UI when that friction is actually felt, not before.
const DISTRICTS = ["강남구", "서초구", "송파구", "마포구", "분당구"];
const KEYWORDS = ["영어학원", "유치원"];
const QUERIES = DISTRICTS.flatMap(d => KEYWORDS.map(k => `${d} ${k}`));
const QUERIES_PER_RUN = 1;
const MAX_PAGES_PER_QUERY = 1;
const LEADS_COLLECTION = "leads";
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

  const existing = await db.collection(LEADS_COLLECTION).select().get();
  const seen = new Set(existing.docs.map(d => d.id));

  const stats = { queriesRun: 0, saved: 0, skipped: 0, failed: 0 };
  const log: string[] = [];

  for (const q of todaysQueries) {
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      const start = page * 5 + 1;
      let data: any;
      try {
        data = await searchNaver(q, start);
      } catch (err: any) {
        log.push(`Search failed for "${q}": ${err.message}`);
        break;
      }

      const items = data.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const naverId = getNaverId(item);
        if (seen.has(naverId)) {
          stats.skipped++;
          continue;
        }
        seen.add(naverId);
        try {
          const withId = { ...item, naver_id: naverId };
          const enriched = await enrichLeadServer(JSON.stringify(withId));
          await db.collection(LEADS_COLLECTION).doc(enriched.naver_id).set({ ...enriched, saved_at: new Date().toISOString() });
          stats.saved++;
          log.push(`Saved: ${stripHtml(item.title)}`);
        } catch (err: any) {
          stats.failed++;
          log.push(`Failed: ${stripHtml(item.title)} — ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 400));
      }

      if (start + 5 > (data.total || 0)) break;
      await new Promise(r => setTimeout(r, 300));
    }
    stats.queriesRun++;
  }

  await cursorRef.set({ nextIndex: (startIndex + QUERIES_PER_RUN) % QUERIES.length, lastRunAt: new Date().toISOString() });

  console.log("cron-sweep", JSON.stringify({ queries: todaysQueries, ...stats, log }));
  res.json({ ok: true, queries: todaysQueries, ...stats });
}
