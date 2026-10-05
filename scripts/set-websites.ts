// Sets the `website` field on leads from a JSON map of Korean name -> URL, for
// sites found by hand that Naver's listing doesn't have. Dry run by default.
//
//   npx tsx scripts/set-websites.ts scripts/lead-websites.json
//   npx tsx scripts/set-websites.ts scripts/lead-websites.json --write
//
// Matches on institution_name_kr among leads that aren't deleted. A name that
// matches no lead or more than one is reported and skipped. Only `website`
// is written.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";
import { adminDb } from "../src/lib/firebaseAdmin";
import { LEGACY_LEADS } from "../src/lib/collections";
import type { EnrichedLead } from "../src/types";

const file = process.argv.find((a, i) => i > 1 && a.endsWith(".json"));
const write = process.argv.includes("--write");

async function main() {
  if (!file) {
    console.error("Usage: npx tsx scripts/set-websites.ts <map.json> [--write]");
    process.exit(1);
  }
  const map: Record<string, string> = JSON.parse(readFileSync(file, "utf8"));
  const snap = await adminDb().collection(LEGACY_LEADS).get();
  const leads = snap.docs.filter(d => !(d.data() as EnrichedLead).deleted);

  let changed = 0;
  for (const [name, url] of Object.entries(map)) {
    const matches = leads.filter(d => (d.data() as EnrichedLead).institution_name_kr === name);
    if (matches.length !== 1) {
      console.log(`  skip  ${name}: ${matches.length === 0 ? "no matching lead" : `${matches.length} leads match`}`);
      continue;
    }
    const current = (matches[0].data() as EnrichedLead).website || "";
    if (current === url) {
      console.log(`  same  ${name}: ${url}`);
      continue;
    }
    console.log(`  ${write ? "set " : "would set"}  ${name}: ${current || "(none)"} -> ${url}`);
    if (write) await matches[0].ref.update({ website: url });
    changed++;
  }
  console.log(`\n${changed} ${write ? "updated" : "would be updated"}.${write ? "" : " Dry run. Re-run with --write to apply."}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
