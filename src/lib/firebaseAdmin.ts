// Server-only Firebase Admin client — bypasses Firestore security rules
// entirely (that's the point: a cron job has no browser session to hold
// the anonymous auth token the client SDK relies on). Never import this
// from client code.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function adminApp() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT not configured on the server.");

  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export function adminDb() {
  return getFirestore(adminApp());
}
