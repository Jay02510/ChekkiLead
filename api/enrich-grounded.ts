import { adminDb } from "../src/lib/firebaseAdmin.js";
import { reenrichLead } from "../src/lib/rag/reenrich.js";
import { canReenrich } from "../src/lib/leadUi.js";
import type { EnrichedLead } from "../src/types";

// Re-enriches ONE saved lead from its sources: collects them first if they're
// older than 30 days, then runs grounded enrichment and saves the result. One
// lead per call so it fits in the 60s function limit (see vercel.json); don't
// batch it here, use scripts/enrich-grounded.ts for that.
export default async function handler(req: any, res: any) {
  try {
    const naverId = req.body?.naver_id;
    if (!naverId) return res.status(400).json({ error: "naver_id is required." });
    const db = adminDb();
    const doc = await db.collection("leads").doc(naverId).get();
    if (!doc.exists) return res.status(404).json({ error: "Lead not found." });
    const lead = doc.data() as EnrichedLead;
    if (!canReenrich(lead)) return res.status(409).json({ error: "This lead can't be re-enriched (removed, non-target, or already contacted)." });
    const { update, collected } = await reenrichLead(db, lead, { write: true });
    res.json({ update, collected });
  } catch (error: any) {
    console.error("Enrich grounded error:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to re-enrich lead." });
  }
}
