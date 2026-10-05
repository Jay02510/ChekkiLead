// Classifies saved leads that were never checked for English (no english_signal)
// using their stored Naver listing: "confirmed" leads are marked as such,
// "unsure" ones go to the Review queue (needs_review), and "none" ones are
// flagged non_target. Leads you already decided on in the app are left alone.
//
//   npx tsx scripts/review-english.ts           # dry run, writes nothing
//   npx tsx scripts/review-english.ts --write   # applies it
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adminDb } from "../src/lib/firebaseAdmin";
import { englishSignal } from "../src/lib/leadFilter";
import type { EnrichedLead } from "../src/types";

const write = process.argv.includes("--write");

async function main() {
  const snap = await adminDb().collection("leads").get();
  const groups: Record<string, string[]> = { confirmed: [], unsure: [], none: [] };
  let skipped = 0;

  for (const d of snap.docs) {
    const lead = d.data() as EnrichedLead;
    if (lead.deleted || lead.non_target || lead.english_signal) { skipped++; continue; }
    const item = lead.naver_raw ?? { title: lead.institution_name_kr, category: "" };
    const signal = englishSignal(item);
    groups[signal].push(lead.institution_name_kr);
    if (!write) continue;
    if (signal === "none") await d.ref.update({ non_target: true });
    else await d.ref.update({ english_signal: signal, needs_review: signal === "unsure" });
  }

  console.log(`${snap.size} leads, ${skipped} skipped (deleted, flagged, or already classified)\n`);
  console.log(`English confirmed (${groups.confirmed.length}):\n  ${groups.confirmed.join("\n  ") || "-"}`);
  console.log(`\nNeeds review (${groups.unsure.length}):\n  ${groups.unsure.join("\n  ") || "-"}`);
  console.log(`\nNon-target, other subject (${groups.none.length}):\n  ${groups.none.join("\n  ") || "-"}`);
  if (!write) console.log("\nDry run. Re-run with --write to apply.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
