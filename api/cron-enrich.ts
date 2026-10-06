import { adminDb } from "../src/lib/firebaseAdmin.js";
import { enrichLeadServer } from "../src/lib/serverActions.js";
import { LEADS } from "../src/lib/collections.js";
import type { EnrichedLead } from "../src/types.js";

// Stage two of two: take a couple of queued leads and enrich them. The sweep
// (api/cron-sweep.ts) saves only what Naver returned; this is where a Gemini
// call happens.
//
// BATCH is 2 against the 60s function ceiling (maxDuration in vercel.json),
// with a 45s stop so a slow second call can finish writing instead of being
// killed mid-update. Whatever is left stays 'queued' and the next run picks it
// up, so the only cost of stopping early is latency.
const BATCH = 2;
const DEADLINE_MS = 45_000;

export default async function handler(req: any, res: any) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const started = Date.now();
  const db = adminDb();
  // Equality on one field, no ordering: a composite index would be one more
  // thing to keep in sync for a queue that is drained oldest-ish anyway.
  const snap = await db.collection(LEADS).where("enrichment_status", "==", "queued").limit(BATCH).get();

  const stats = { enriched: 0, failed: 0, skipped: 0, remaining: 0 };
  const log: string[] = [];

  for (const docSnap of snap.docs) {
    if (Date.now() - started > DEADLINE_MS) {
      log.push("Stopped at the 45s mark; the rest stays queued.");
      break;
    }
    const lead = docSnap.data() as EnrichedLead;
    if (!lead.naver_raw) {
      // Nothing to enrich from. Failing it is honest: it needs a person.
      await docSnap.ref.update({ enrichment_status: "failed", enrichment_error: "No naver_raw on the queued record." });
      stats.skipped++;
      continue;
    }
    try {
      const enriched = await enrichLeadServer(lead.naver_raw);
      await docSnap.ref.update({
        ...enriched,
        // The queued record's own review state was computed in code from the
        // Naver listing; enrichLeadServer recomputes it the same way, so
        // taking the fresh one keeps a single source of truth.
        enrichment_status: "enriched",
        enrichment_error: "",
        enriched_at: new Date().toISOString(),
      });
      stats.enriched++;
      log.push(`Enriched: ${lead.institution_name_kr}`);
    } catch (err: any) {
      // Out of quota is not this lead's fault — leave it queued and stop, or
      // the whole batch burns its attempts against a closed door.
      if (err?.quota) {
        log.push(`Out of Gemini quota at ${lead.institution_name_kr}; left queued.`);
        break;
      }
      await docSnap.ref.update({
        enrichment_status: "failed",
        enrichment_error: String(err?.message ?? err).slice(0, 500),
        enrichment_attempts: (lead.enrichment_attempts ?? 0) + 1,
      });
      stats.failed++;
      log.push(`Failed: ${lead.institution_name_kr} — ${err?.message}`);
    }
  }

  const left = await db.collection(LEADS).where("enrichment_status", "==", "queued").count().get();
  stats.remaining = left.data().count;

  console.log("cron-enrich", JSON.stringify({ ...stats, log }));
  res.json({ ok: true, ...stats });
}
