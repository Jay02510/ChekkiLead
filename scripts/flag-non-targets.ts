// Marks existing leads that fail isLikelyTarget with non_target: true.
// Never deletes: flagged leads stay in the collection so dedupe still sees
// them and no sweep re-adds them. The Database view hides them behind a
// "Show non-targets" toggle.
//
//   npx tsx scripts/flag-non-targets.ts           # dry run, writes nothing
//   npx tsx scripts/flag-non-targets.ts --write   # applies the flags
//   npx tsx scripts/flag-non-targets.ts --unflag          # dry run: flagged leads that now pass the filter
//   npx tsx scripts/flag-non-targets.ts --unflag --write  # clears their non_target flag
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adminDb } from "../src/lib/firebaseAdmin";
import { isLikelyTarget } from "../src/lib/leadFilter";
import type { EnrichedLead } from "../src/types";

const LEADS_COLLECTION = "leads";
const write = process.argv.includes("--write");
const unflag = process.argv.includes("--unflag");

async function main() {
  const db = adminDb();
  const snap = await db.collection(LEADS_COLLECTION).get();
  const flagged: string[] = [];
  const kept: string[] = [];
  let noRaw = 0;

  for (const docSnap of snap.docs) {
    const lead = docSnap.data() as EnrichedLead;
    if (lead.deleted) continue;
    // Unflag mode only looks at flagged leads the filter would now keep.
    if (unflag) {
      if (!lead.non_target) continue;
      const raw = lead.naver_raw ?? { title: lead.institution_name_kr, category: "" };
      if (!isLikelyTarget(raw)) continue;
      flagged.push(lead.institution_name_kr);
      if (write) await docSnap.ref.update({ non_target: false });
      continue;
    }
    if (lead.non_target) continue;
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

  if (unflag) {
    console.log(`${snap.size} leads: ${flagged.length} ${write ? "unflagged" : "would be unflagged"}`);
    flagged.forEach(f => console.log(`  target again: ${f}`));
    if (!write) console.log("\nDry run. Re-run with --unflag --write to apply.");
    return;
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
