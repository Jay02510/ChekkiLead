// Writes eval/gold.json: 30 random saved target leads (with naver_raw) and
// blank answer fields to fill in by hand. Run once, after backfill-naver-raw
// and flag-non-targets. Only leads that pass isLikelyTarget and aren't
// flagged non_target are sampled. Answers are never pre-filled — gold must
// be a human's reading of the sources, not another model's.
//
//   npx tsx eval/init-gold.ts
//
// Refuses to overwrite an existing gold.json — that file holds hours of
// hand-checked answers.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { existsSync, writeFileSync } from "node:fs";
import { adminDb } from "../src/lib/firebaseAdmin";
import { isLikelyTarget } from "../src/lib/leadFilter";
import type { EnrichedLead } from "../src/types";

const GOLD_PATH = "eval/gold.json";
const SAMPLE_SIZE = 30;

async function main() {
  if (existsSync(GOLD_PATH)) {
    console.error(`${GOLD_PATH} already exists — not overwriting. Delete it yourself if you really mean to start over.`);
    process.exit(1);
  }

  const snap = await adminDb().collection("leads").get();
  const all = snap.docs.map(d => d.data() as EnrichedLead).filter(l => l.naver_raw && !l.deleted);
  const pool = all.filter(l => !l.non_target && isLikelyTarget(l.naver_raw!));
  console.log(`${all.length} leads with naver_raw, ${pool.length} are targets.`);
  if (pool.length < SAMPLE_SIZE) {
    console.error(`Need ${SAMPLE_SIZE} targets, have ${pool.length}. Run more sweeps (and backfill-naver-raw.ts --write) first. Nothing written.`);
    process.exit(1);
  }

  const sample = pool.sort(() => Math.random() - 0.5).slice(0, SAMPLE_SIZE);
  const entries = sample.map(l => ({
    naver_id: l.naver_id,
    name_kr: l.institution_name_kr,
    naver_link: l.naver_raw!.link,
    checked: false,
    gold: {
      age_min: null,
      age_max: null,
      cefr_levels: null,
      email: null,
      hook_fact: null,
      sources: { age: [], levels: [], email: [], hook: [] },
    },
    naver_raw: l.naver_raw,
  }));

  writeFileSync(GOLD_PATH, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Wrote ${entries.length} entries to ${GOLD_PATH}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
