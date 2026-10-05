// Prints the latest result for each mode side by side:
// baseline_v0 vs baseline vs grounded_full vs grounded_retrieval.
//
//   npm run eval:compare
//
// Run `npm run eval -- --mode <mode>` for each mode first.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { formatComparison, type ResultSummary } from "./compare-format";

const dir = "eval/results";
const MODES = ["baseline_v0", "baseline", "grounded_full", "grounded_retrieval"];

const files = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => ({ f, t: statSync(`${dir}/${f}`).mtimeMs }));
const latest: ResultSummary[] = [];
for (const mode of MODES) {
  const mine = files
    .map(x => ({ ...x, r: JSON.parse(readFileSync(`${dir}/${x.f}`, "utf8")) }))
    .filter(x => (x.r.mode ?? "baseline") === mode)
    .sort((a, b) => b.t - a.t)[0];
  if (mine) latest.push({ mode, commit: mine.r.commit, summary: mine.r.summary });
  else console.warn(`No result for ${mode} yet — run: npm run eval -- --mode ${mode}`);
}
if (latest.length === 0) throw new Error("No result files in eval/results/.");
console.log(formatComparison(latest));
