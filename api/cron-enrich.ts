import { adminDb } from "../src/lib/firebaseAdmin.js";
import { LEADS } from "../src/lib/collections.js";
import { reenrichLead, sourcesAreFresh } from "../src/lib/rag/reenrich.js";
import { DEFAULT_GROUNDED_MODE } from "../src/lib/rag/ground.js";
import { firstEnrichmentUpdate } from "../src/lib/queue.js";
import type { EnrichedLead } from "../src/types.js";

// Stage two of two: take queued leads and enrich them from their own sources.
// The sweep (api/cron-sweep.ts) saves only what Naver returned; this is where
// everything expensive happens — fetching the school's site and blog, chunking
// it, and one grounded Gemini call that may answer only from those chunks.
//
// Deliberately not enrichLeadServer: that path asks the model about a school it
// has never read, which is the guessing this rebuild exists to stop. A lead
// enriched here either has a fact with a verified quote behind it or has no
// fact at all.
//
// Timing against the 60s function ceiling (maxDuration in vercel.json).
// Collection is several HTTP fetches of pages this code doesn't control, so it
// is budgeted far more generously than the enrichment call. A lead whose
// collection could not start in time stays 'queued' and costs nothing but a
// wait — being killed mid-write would be worse.
const BATCH = 2;
const DEADLINE_MS = 45_000;
const NEEDED_TO_COLLECT_MS = 25_000;
const NEEDED_TO_ENRICH_MS = 12_000;

export default async function handler(req: any, res: any) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const started = Date.now();
  const left = () => DEADLINE_MS - (Date.now() - started);
  const db = adminDb();
  // Equality on one field, no ordering: a composite index would be one more
  // thing to keep in sync for a queue that is drained oldest-ish anyway.
  const snap = await db.collection(LEADS).where("enrichment_status", "==", "queued").limit(BATCH).get();

  const stats = { enriched: 0, failed: 0, deferred: 0, skipped: 0, remaining: 0 };
  const log: string[] = [];

  for (const docSnap of snap.docs) {
    const lead = { naver_id: docSnap.id, ...docSnap.data() } as EnrichedLead;
    if (!lead.naver_raw) {
      // Nothing to enrich from. Failing it is honest: it needs a person.
      await docSnap.ref.update({ enrichment_status: "failed", enrichment_error: "No naver_raw on the queued record." });
      stats.skipped++;
      continue;
    }

    // Decided before the work starts, because the collection inside
    // reenrichLead can't be interrupted once it has begun.
    const needsCollection = !sourcesAreFresh(lead);
    const needed = needsCollection ? NEEDED_TO_COLLECT_MS : NEEDED_TO_ENRICH_MS;
    if (left() < needed) {
      stats.deferred++;
      log.push(`Left queued: ${lead.institution_name_kr} (${Math.round(left() / 1000)}s left, needs ~${needed / 1000}s)`);
      continue;
    }

    try {
      const { grounded, collected } = await reenrichLead(db, lead, { mode: DEFAULT_GROUNDED_MODE, write: true });
      // reenrichLead has already written the fields a re-enrichment changes.
      // A queued lead was never enriched at all, so the English name, type and
      // district still have to be filled in.
      await docSnap.ref.update({
        ...firstEnrichmentUpdate(grounded, lead.manual_fields),
        enrichment_status: "enriched",
        enrichment_error: "",
        enriched_at: new Date().toISOString(),
      });
      stats.enriched++;
      log.push(`Enriched: ${lead.institution_name_kr} (${DEFAULT_GROUNDED_MODE}${collected ? ", sources collected" : ", stored sources"})`);
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

  const remaining = await db.collection(LEADS).where("enrichment_status", "==", "queued").count().get();
  stats.remaining = remaining.data().count;

  console.log("cron-enrich", JSON.stringify({ mode: DEFAULT_GROUNDED_MODE, ...stats, log }));
  res.json({ ok: true, mode: DEFAULT_GROUNDED_MODE, ...stats });
}
