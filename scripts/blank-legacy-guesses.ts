// Clears the invented values out of the legacy leads collection.
//
// The original pipeline was told to "always provide something": it constructed
// email addresses from domain names and produced an age range and CEFR levels
// for schools that publish neither. Those values still sit in `leads`, and
// they look exactly like the ones that are real. Blanking them leaves the
// record — name, phone, address, status, naver_raw — intact, so dedupe and the
// contact blocklist keep working, while nothing that was guessed is left to be
// read as fact.
//
//   npx tsx scripts/blank-legacy-guesses.ts           # dry run, writes nothing
//   npx tsx scripts/blank-legacy-guesses.ts --write   # applies, after a backup
//
// --write exports every document to backups/legacy-leads-<date>.json first and
// refuses to touch Firestore if that export fails. backups/ is gitignored: it
// holds production contact data.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import fs from "node:fs";
import path from "node:path";
import { adminDb } from "../src/lib/firebaseAdmin";
import { LEGACY_LEADS } from "../src/lib/collections";
import type { EnrichedLead } from "../src/types";

const write = process.argv.includes("--write");
const BACKUP_DIR = "backups";

// Fields the model was free to invent, with what an unknown looks like for
// each. A scraped email is not a guess, so email is handled separately.
const BLANKED = {
  student_age_range: "",
  approx_students: "",
  cefr_levels_taught: [] as string[],
  personalization_hook: "",
};

type Blankable = keyof typeof BLANKED;

// What this lead would lose. Empty when there is nothing invented left.
export function plannedBlanks(lead: EnrichedLead): Record<string, unknown> {
  const manual = new Set(lead.manual_fields ?? []);
  const update: Record<string, unknown> = {};

  for (const [field, empty] of Object.entries(BLANKED) as [Blankable, unknown][]) {
    // A person typed this in. Theirs outranks anything this script knows.
    if (manual.has(field)) continue;
    const current = lead[field];
    const isEmpty = Array.isArray(current) ? current.length === 0 : !current;
    if (!isEmpty) update[field] = empty;
  }

  // Only a constructed address goes. 'scraped' came off a real page, and
  // 'unknown' is already blank.
  if (lead.email_confidence === "estimated" && !manual.has("email")) {
    update.email = "";
    update.email_confidence = "unknown";
  }
  return update;
}

async function main() {
  const db = adminDb();
  const snap = await db.collection(LEGACY_LEADS).get();

  const plans = snap.docs
    .map(d => ({ ref: d.ref, lead: d.data() as EnrichedLead, update: plannedBlanks(d.data() as EnrichedLead) }))
    .filter(p => Object.keys(p.update).length > 0);

  const fieldCounts: Record<string, number> = {};
  for (const p of plans) for (const f of Object.keys(p.update)) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;

  console.log(`${snap.size} leads in ${LEGACY_LEADS}; ${plans.length} carry invented values.\n`);
  for (const p of plans) {
    console.log(`  ${p.lead.institution_name_kr}  ${Object.keys(p.update).join(", ")}`);
  }
  console.log(`\nField totals:`);
  for (const [f, n] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(22)} ${n}`);

  if (!write) {
    console.log(`\nDry run, nothing written. Re-run with --write to apply (it backs up ${LEGACY_LEADS} first).`);
    return;
  }

  // Back up everything, not just the documents about to change: this is the
  // only copy of what the old pipeline produced, and it's the "before" half
  // of any later comparison.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `legacy-leads-${new Date().toISOString().slice(0, 10)}.json`);
  const dump = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  fs.writeFileSync(backupPath, JSON.stringify(dump, null, 2));
  const written = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  if (written.length !== snap.size) throw new Error(`Backup holds ${written.length} of ${snap.size} leads. Nothing written to Firestore.`);
  console.log(`\nBacked up ${written.length} leads to ${backupPath}`);

  let updated = 0;
  for (const p of plans) {
    await p.ref.update({ ...p.update, guesses_blanked_at: new Date().toISOString() });
    updated++;
  }
  console.log(`Blanked guessed values on ${updated} leads. Names, phones, addresses, statuses and naver_raw untouched.`);
}

if (process.argv[1]?.endsWith("blank-legacy-guesses.ts")) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
