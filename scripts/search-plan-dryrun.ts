// Runs every query in the search plan against Naver and reports what the
// pipeline would do with the results. No Gemini calls, no writes — this is for
// judging the search plan before turning any sweep on.
//
//   npx tsx scripts/search-plan-dryrun.ts [--limit N] [--verbose]
//
//   --limit N   only the first N queries (each query is one Naver call)
//   --verbose   list every new place, with its district and category
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adminDb } from "../src/lib/firebaseAdmin";
import { searchNaver } from "../src/lib/serverActions";
import { getNaverId, stripHtml } from "../src/lib/naverId";
import { isLikelyTarget, englishSignal } from "../src/lib/leadFilter";
import { loadContactBlocklist } from "../src/lib/blocklist";
import { LEADS } from "../src/lib/collections";
import { buildQueries } from "../src/lib/searchPlan";
import type { NaverSearchResult } from "../src/types";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const verbose = process.argv.includes("--verbose");
const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
if (arg("--limit") && !(limit > 0)) throw new Error("--limit needs a positive number.");

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "n/a");

async function main() {
  const db = adminDb();
  const [existing, blocklist] = await Promise.all([
    db.collection(LEADS).select().get(),
    loadContactBlocklist(db),
  ]);
  const saved = new Set(existing.docs.map(d => d.id));

  const queries = buildQueries().slice(0, limit);
  console.log(`${queries.length} queries, ${saved.size} leads already in ${LEADS}, ${blocklist.size} on the contact blocklist.\n`);

  // Keyed by naver_id so a place found by two queries counts once.
  const places = new Map<string, { item: NaverSearchResult; query: string }>();
  let searchFailures = 0;
  const emptyQueries: string[] = [];

  for (const query of queries) {
    let data: any;
    try {
      data = await searchNaver(query, 1);
    } catch (err: any) {
      searchFailures++;
      console.log(`  search failed  ${query}: ${err.message}`);
      continue;
    }
    const items: NaverSearchResult[] = data.items || [];
    if (items.length === 0) emptyQueries.push(query);
    for (const item of items) {
      const id = getNaverId(item);
      if (!places.has(id)) places.set(id, { item, query });
    }
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 300));
  }
  console.log("\n");

  const all = [...places.entries()];
  const blocked = all.filter(([id]) => blocklist.has(id));
  const notBlocked = all.filter(([id]) => !blocklist.has(id));
  const targets = notBlocked.filter(([, p]) => isLikelyTarget(p.item));
  const newTargets = targets.filter(([id]) => !saved.has(id));
  const signals = { confirmed: 0, unsure: 0, none: 0 };
  for (const [, p] of newTargets) signals[englishSignal(p.item)]++;

  if (verbose) {
    for (const [id, p] of newTargets) {
      console.log(`  new  ${stripHtml(p.item.title)}  [${p.item.category}]  ${englishSignal(p.item)}  (${p.query}, ${id})`);
    }
    console.log("");
  }

  console.log(`Search plan over ${queries.length} queries
  unique places found      ${all.length}
  on the contact blocklist ${blocked.length}
  pass isLikelyTarget      ${pct(targets.length, notBlocked.length)}
  already saved            ${targets.length - newTargets.length}
  NEW leads this would add ${newTargets.length}
    English confirmed      ${signals.confirmed}
    needs review (unsure)  ${signals.unsure}
  places per query         ${(all.length / queries.length).toFixed(1)}
  queries returning none   ${emptyQueries.length}${emptyQueries.length && verbose ? `  (${emptyQueries.join(", ")})` : ""}
  search failures          ${searchFailures}

Nothing was enriched or written.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
