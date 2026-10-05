// Freezes the collected sources of every lead in eval/gold.json to
// eval/sources/{naver_id}.json, so eval runs score against identical text
// even after the web (or a later collect-sources run) changes.
//
//   npx tsx eval/snapshot-sources.ts
//
// eval/sources/ is gitignored: third-party blog text belongs to the parents
// who wrote it and must not go into this public repo.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { adminDb } from "../src/lib/firebaseAdmin";
import { LEGACY_LEADS } from "../src/lib/collections";

async function main() {
  const gold: { naver_id: string; name_kr: string }[] = JSON.parse(readFileSync("eval/gold.json", "utf8"));
  const db = adminDb();
  mkdirSync("eval/sources", { recursive: true });

  let empty = 0;
  for (const entry of gold) {
    const leadRef = db.collection(LEGACY_LEADS).doc(entry.naver_id);
    const [lead, sources] = await Promise.all([leadRef.get(), leadRef.collection("sources").get()]);
    const data = lead.data() ?? {};
    if (sources.empty) empty++;
    writeFileSync(
      `eval/sources/${entry.naver_id}.json`,
      JSON.stringify({
        naver_id: entry.naver_id,
        name_kr: entry.name_kr,
        snapshot_at: new Date().toISOString(),
        sources_collected_at: data.sources_collected_at ?? null,
        candidate_emails: data.candidate_emails ?? [],
        sources: sources.docs.map(d => ({ id: d.id, ...d.data() })),
      }, null, 2) + "\n",
    );
    console.log(`${entry.name_kr}: ${sources.size} sources`);
  }
  console.log(`\nSnapshotted ${gold.length} leads to eval/sources/ (${empty} had no sources — run collect-sources.ts --gold --write first).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
