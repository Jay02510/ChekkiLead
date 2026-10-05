// Formats the side-by-side table for eval/compare.ts.
export interface ResultSummary {
  mode: string;
  commit: string;
  summary: Record<string, any>;
}

const pct = (x: unknown) => (typeof x === "number" && !Number.isNaN(x) ? `${(x * 100).toFixed(1)}%` : "n/a");
const num = (x: unknown, d = 1) => (typeof x === "number" && !Number.isNaN(x) ? x.toFixed(d) : "n/a");

// [label, format, lower is better?]
const ROWS: [string, (s: Record<string, any>) => string][] = [
  ["Leads scored", s => String(s.leads_scored ?? "n/a")],
  ["Enrichment failures", s => String(s.enrichment_failures ?? "n/a")],
  ["Age range (IoU)", s => pct(s.age_range_iou)],
  ["CEFR levels (Jaccard)", s => pct(s.cefr_levels_jaccard)],
  ["Email exact match", s => pct(s.email_exact_match)],
  ['"scraped" but wrong (count)', s => String(s.email_false_scraped ?? "n/a")],
  ["Claims where nothing findable (lower is better)", s => pct(s.not_found_claim_rate)],
  ["Hook supported (lower bound)", s => pct(s.hook_supported)],
  ["Verification failure rate (lower is better)", s => pct(s.verification_failure_rate)],
  ["Inferred claims (count)", s => (typeof s.inferred_claims === "number" ? String(s.inferred_claims) : "n/a")],
  ["Cited-source agreement", s => pct(s.cited_source_agreement)],
  ["not_found precision", s => pct(s.not_found_precision)],
  ["Calls per lead", s => num(s.calls_per_lead)],
  ["Input tokens per lead", s => num(s.input_tokens_per_lead, 0)],
  ["Seconds per lead", s => num(s.seconds_per_lead)],
];

export function formatComparison(results: ResultSummary[]): string {
  const cols = results.map(r => `${r.mode} @ ${r.commit}`);
  const labelWidth = Math.max(...ROWS.map(r => r[0].length), 6);
  const widths = cols.map(c => Math.max(c.length, 8));
  const line = (label: string, cells: string[]) =>
    `${label.padEnd(labelWidth)}  ${cells.map((c, i) => c.padStart(widths[i])).join("  ")}`;
  return [
    line("", cols),
    line("-".repeat(labelWidth), widths.map(w => "-".repeat(w))),
    ...ROWS.map(([label, f]) => line(label, results.map(r => f(r.summary)))),
  ].join("\n");
}
