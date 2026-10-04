// Retrieval coverage against gold: of the facts a human found, how many did
// source collection also reach? This is the ceiling for retrieval-grounded
// enrichment — it can't cite a fact retrieval never found.
//
//   npm run eval:coverage
//
// Reads eval/gold.json and the frozen eval/sources/{naver_id}.json
// (run eval/snapshot-sources.ts first).
import { existsSync, readFileSync } from "node:fs";
import { urlHit, emailHit } from "./coverage-score";
import { isNotFound } from "./score";

interface GoldEntry {
  naver_id: string;
  name_kr: string;
  checked: boolean;
  gold: {
    age_min: number | "not_found" | null;
    age_max: number | "not_found" | null;
    cefr_levels: string[] | "not_found" | null;
    email: string | "not_found" | null;
    hook_fact: string | "not_found" | null;
    sources?: { age?: string[]; levels?: string[]; email?: string[]; hook?: string[] };
  };
}

type Field = "email" | "hook" | "age" | "levels";
const tally: Record<Field, { hit: number; total: number }> = {
  email: { hit: 0, total: 0 }, hook: { hit: 0, total: 0 }, age: { hit: 0, total: 0 }, levels: { hit: 0, total: 0 },
};
const misses: string[] = [];

function main() {
  const entries: GoldEntry[] = JSON.parse(readFileSync("eval/gold.json", "utf8")).filter((e: GoldEntry) => e.checked);
  if (entries.length === 0) throw new Error("No entries in eval/gold.json have checked: true yet.");

  let missingSnapshot = 0;
  for (const e of entries) {
    const path = `eval/sources/${e.naver_id}.json`;
    if (!existsSync(path)) {
      missingSnapshot++;
      console.warn(`No snapshot for ${e.name_kr} (${path}) — run eval/snapshot-sources.ts.`);
      continue;
    }
    const snap = JSON.parse(readFileSync(path, "utf8"));
    const collectedUrls: string[] = snap.sources.filter((s: any) => s.status === "ok").map((s: any) => s.url);
    const record = (field: Field, hit: boolean) => {
      tally[field].total++;
      if (hit) tally[field].hit++;
      else misses.push(`${e.name_kr}: ${field}`);
    };

    // A not_found field has no true source to find, so it isn't measured here.
    const g = e.gold;
    if (g.email && !isNotFound(g.email)) record("email", emailHit(g.email, snap.candidate_emails ?? []));
    if (g.hook_fact && !isNotFound(g.hook_fact)) record("hook", urlHit(g.sources?.hook ?? [], collectedUrls));
    if (g.age_min != null && !isNotFound(g.age_min)) record("age", urlHit(g.sources?.age ?? [], collectedUrls));
    if (g.cefr_levels && !isNotFound(g.cefr_levels)) record("levels", urlHit(g.sources?.levels ?? [], collectedUrls));
  }

  const line = (label: string, f: Field, what: string) => {
    const { hit, total } = tally[f];
    return `  ${label.padEnd(8)} ${total ? `${((hit / total) * 100).toFixed(0)}%`.padStart(4) : " n/a"}  (${hit}/${total})  ${what}`;
  };
  console.log(`
Retrieval coverage over ${entries.length - missingSnapshot} checked gold leads
${line("email", "email", "gold email is among candidate_emails")}
${line("hook", "hook", "a gold hook source URL was collected")}
${line("age", "age", "a gold age source URL was collected")}
${line("levels", "levels", "a gold levels source URL was collected")}
Enrichment can't cite a fact retrieval never found: these are the ceiling.`);
  if (misses.length) console.log(`\nMissed:\n${misses.map(m => `  ${m}`).join("\n")}`);
}

main();
