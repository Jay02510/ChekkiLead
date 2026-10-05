// Re-enriches saved leads from their collected sources (collecting first when
// the sources are older than 30 days). Dry run by default: it still calls
// Gemini, but saves nothing, including newly collected sources.
//
//   npx tsx scripts/enrich-grounded.ts --limit 5             # dry run
//   npx tsx scripts/enrich-grounded.ts --limit 5 --write
//
// Skips deleted, non_target and opted_out leads and anything already sent.
// Text a person typed in (Edit details) is kept.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adminDb } from "../src/lib/firebaseAdmin";
import { reenrichLead } from "../src/lib/rag/reenrich";
import { DEFAULT_GROUNDED_MODE } from "../src/lib/rag/ground";
import { canReenrich } from "../src/lib/leadUi";
import type { EnrichedLead, GroundedMode } from "../src/types";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const write = process.argv.includes("--write");
const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
const mode = (arg("--mode") ?? DEFAULT_GROUNDED_MODE) as GroundedMode;

async function main() {
  if (mode !== "grounded_full" && mode !== "grounded_retrieval") {
    console.error("--mode must be grounded_full or grounded_retrieval.");
    process.exit(1);
  }
  const db = adminDb();
  const snap = await db.collection("leads").get();
  const leads = snap.docs.map(d => d.data() as EnrichedLead).filter(canReenrich);
  const batch = leads.slice(0, limit);
  console.log(`${snap.size} leads, ${leads.length} eligible, enriching ${batch.length} in ${mode}${write ? "" : " (dry run, nothing saved)"}\n`);

  let failed = 0;
  for (const lead of batch) {
    try {
      const { grounded, collected } = await reenrichLead(db, lead, { mode, write });
      const f = grounded.facts!;
      const got = (["age_range", "approx_students", "cefr_levels", "hook"] as const).filter(k => f[k].status !== "not_found");
      console.log(`${lead.institution_name_kr}: ${collected ? "collected, " : ""}${grounded.grounding!.chunks_given} chunks, found [${got.join(", ") || "nothing"}], ${grounded.grounding!.verification_failures} failed quotes, email ${grounded.email || "-"}`);
    } catch (err: any) {
      failed++;
      console.log(`${lead.institution_name_kr}: FAILED ${err.message}`);
      if (err.quota) { console.log("Gemini quota hit — stopping."); break; }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`\nDone, ${failed} failed.${write ? "" : " Dry run. Re-run with --write to save."}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
