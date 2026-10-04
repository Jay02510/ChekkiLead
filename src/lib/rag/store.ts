// Server-only: writes collected sources with the Admin SDK. Clients can
// read leads/{id}/sources (owner only) but never write it — see firestore.rules.
import type { Firestore } from "firebase-admin/firestore";
import type { CollectResult } from "./collect.js";

export const LEADS_COLLECTION = "leads";

// Re-collecting overwrites sources with the same URL and adds new ones; it
// does not delete sources the new run no longer finds.
export async function saveSources(db: Firestore, naverId: string, result: CollectResult): Promise<void> {
  const leadRef = db.collection(LEADS_COLLECTION).doc(naverId);
  const batch = db.batch();
  for (const { id, ...doc } of result.sources) {
    batch.set(leadRef.collection("sources").doc(id), doc);
  }
  batch.update(leadRef, {
    sources_collected_at: new Date().toISOString(),
    source_counts: result.counts,
    candidate_emails: result.candidate_emails,
  });
  await batch.commit();
}
