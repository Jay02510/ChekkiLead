import { adminDb } from "../src/lib/firebaseAdmin.js";
import { searchNaver, enrichLeadServer } from "../src/lib/serverActions.js";
import { getNaverId, stripHtml } from "../src/lib/naverId.js";

// Runs the same search -> dedupe -> enrich -> save pipeline as the UI's
// "Bulk Sweep" button, unattended, on Vercel Cron (see vercel.json).
// Never sends anything — leads land in Firestore as not_contacted, same
// as a manual sweep; outreach is still a deliberate human action.
//
// ponytail: query list is a fixed constant, not a Firestore-backed
// settings UI — edit this array and redeploy to change targets. Add a
// settings doc/UI when that friction is actually felt, not before.
const DISTRICTS = ["강남구", "서초구", "송파구", "마포구", "분당구"];
const KEYWORDS = ["영어학원", "유치원"];
const QUERIES = DISTRICTS.flatMap(d => KEYWORDS.map(k => `${d} ${k}`));
const MAX_PAGES_PER_QUERY = 3;
const LEADS_COLLECTION = "leads";

export default async function handler(req: any, res: any) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = adminDb();
  const existing = await db.collection(LEADS_COLLECTION).select().get();
  const seen = new Set(existing.docs.map(d => d.id));

  const stats = { queriesRun: 0, saved: 0, skipped: 0, failed: 0 };
  const log: string[] = [];

  for (const q of QUERIES) {
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
          await db.collection(LEADS_COLLECTION).doc(enriched.naver_id).set(enriched);
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

  console.log("cron-sweep", JSON.stringify({ ...stats, log }));
  res.json({ ok: true, ...stats });
}
