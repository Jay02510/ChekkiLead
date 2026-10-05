// Academies that must never enter the active pipeline again, read from the
// legacy collection (src/lib/collections.ts).
//
// The old `leads` collection is the only record of who has already been
// contacted. Starting a fresh `leads_v2` would otherwise lose that and let a
// sweep re-add an academy that opted out — which is both a legal problem
// (정보통신망법 Article 50 requires an opt-out to be honoured) and the fastest
// way to burn a lead. So every path that can create a v2 lead checks this set
// first.
//
// A legacy lead that was never contacted (not_contacted, pending) is NOT
// blocked: those are exactly the ones worth running through the new pipeline.
import type { Firestore } from "firebase-admin/firestore";
import { LEGACY_LEADS } from "./collections.js";

// `pending` and `not_contacted` are deliberately absent.
export const BLOCKED_STATUSES = new Set(["opted_out", "sent", "replied", "bounced"]);

// `deleted` means a person looked at the lead and threw it out, so re-adding
// it would re-create work they already did.
export function isContactBlocked(lead: { firebase_status?: string; deleted?: boolean }): boolean {
  return lead.deleted === true || BLOCKED_STATUSES.has(lead.firebase_status ?? "");
}

// Takes query-snapshot docs, which look the same in the Admin and Web SDKs.
// The document id is the naver_id; data().naver_id is a fallback for any
// legacy doc saved under a different key.
export function blocklistFromDocs(docs: { id: string; data(): any }[]): Set<string> {
  const blocked = new Set<string>();
  for (const d of docs) {
    const data = d.data() ?? {};
    if (isContactBlocked(data)) blocked.add(data.naver_id ?? d.id);
  }
  return blocked;
}

// Server-side (Admin SDK) loader. The Web SDK has no field projection, so the
// UI calls blocklistFromDocs on a plain getDocs instead.
export async function loadContactBlocklist(db: Firestore): Promise<Set<string>> {
  const snap = await db.collection(LEGACY_LEADS).select("firebase_status", "deleted", "naver_id").get();
  return blocklistFromDocs(snap.docs);
}
