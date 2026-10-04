// Marks existing leads that fail isLikelyTarget with non_target: true.
// Never deletes: flagged leads stay in the collection so dedupe still sees
// them and no sweep re-adds them. The Database view hides them behind a
// "Show non-targets" toggle.
//
//   npx tsx scripts/flag-non-targets.ts           # dry run, writes nothing
//   npx tsx scripts/flag-non-targets.ts --write   # applies the flags
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adminDb } from "../src/lib/firebaseAdmin";
import { isLikelyTarget } from "../src/lib/leadFilter";
import type { EnrichedLead } from "../src/types";

const LEADS_COLLECTION = "leads";
const write = process.argv.includes("--write");

async function main() {
  const db = adminDb();
  const snap = await db.collection(LEADS_COLLECTION).get();
  const flagged: string[] = [];
  const kept: string[] = [];
  let noRaw = 0;

  for (const docSnap of snap.docs) {
    const lead = docSnap.data() as EnrichedLead;
    if (lead.deleted || lead.non_target) continue;
    // Leads saved before naver_raw existed (and not backfilled) have no
    // Naver category; judge those on the title alone.
    if (!lead.naver_raw) noRaw++;
    const item = lead.naver_raw ?? { title: lead.institution_name_kr, category: "" };
    if (isLikelyTarget(item)) {
      kept.push(lead.institution_name_kr);
      continue;
    }
    flagged.push(`${lead.institution_name_kr}  [${lead.naver_raw?.category ?? "no category"}]`);
    if (write) await docSnap.ref.update({ non_target: true });
  }

  console.log(`${snap.size} leads: ${flagged.length} ${write ? "flagged" : "would be flagged"}, ${kept.length} kept as targets (${noRaw} judged on title only)`);
  flagged.forEach(f => console.log(`  non-target: ${f}`));
  console.log(`\nTargets kept:`);
  kept.forEach(k => console.log(`  ${k}`));
  if (!write) console.log("\nDry run. Re-run with --write to apply.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
