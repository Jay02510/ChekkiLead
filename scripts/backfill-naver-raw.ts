// Recovers naver_raw for leads saved before it was stored, by re-searching
// each lead's name on Naver and keeping only a result whose dedupe key
// matches the saved naver_id exactly — never a "closest" guess.
//
//   npx tsx scripts/backfill-naver-raw.ts           # dry run, writes nothing
//   npx tsx scripts/backfill-naver-raw.ts --write   # applies the updates
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adminDb } from "../src/lib/firebaseAdmin";
import { searchNaver } from "../src/lib/serverActions";
import { getNaverId } from "../src/lib/naverId";
import type { EnrichedLead, NaverSearchResult } from "../src/types";

const LEADS_COLLECTION = "leads";
const write = process.argv.includes("--write");

async function findMatch(lead: EnrichedLead): Promise<NaverSearchResult | null> {
  const queries = [lead.institution_name_kr, `${lead.district} ${lead.institution_name_kr}`];
  for (const q of queries) {
    const data = await searchNaver(q, 1);
    const match = (data.items || []).find((item: NaverSearchResult) => getNaverId(item) === lead.naver_id);
    if (match) return match;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function main() {
  const db = adminDb();
  const snap = await db.collection(LEADS_COLLECTION).get();
  const todo = snap.docs.filter(d => !d.data().naver_raw);
  console.log(`${snap.size} leads, ${todo.length} missing naver_raw${write ? "" : " (dry run)"}`);

  const unmatched: string[] = [];
  for (const docSnap of todo) {
    const lead = docSnap.data() as EnrichedLead;
    const match = await findMatch(lead);
    if (!match) {
      unmatched.push(`${lead.institution_name_kr} (${lead.naver_id})`);
      continue;
    }
    if (write) await docSnap.ref.update({ naver_raw: match });
    console.log(`${write ? "Updated" : "Would update"}: ${lead.institution_name_kr}`);
  }

  console.log(`\nMatched ${todo.length - unmatched.length}/${todo.length}.`);
  if (unmatched.length) console.log(`No exact match (left untouched):\n  ${unmatched.join("\n  ")}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
