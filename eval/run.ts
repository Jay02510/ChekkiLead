// Scores the current pipeline (enrichLeadServer, as checked out) against the
// hand-checked answers in eval/gold.json. To score another version, check
// out that commit and run this again — the result file records the commit.
//
//   npm run eval                      # baseline, the frozen original prompt
//   npm run eval -- --mode <mode>     # baseline | grounded_full | grounded_retrieval
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GoogleGenAI, Type } from "@google/genai";
import { enrichLeadServer, type UsageSink } from "../src/lib/serverActions";
import { enrichGroundedServer } from "../src/lib/groundedEnrich";
import { loadFrozen } from "./frozen";
import { urlHit } from "./coverage-score";
import type { EnrichedLead, EnrichMode, NaverSearchResult } from "../src/types";
import { parseAgeRange, ageIoU, jaccard, sameEmail, isNotFound, claimsValue, factFor, citedFactCounts, citedSourceAgrees, rate, ClaimField } from "./score";

interface GoldEntry {
  naver_id: string;
  name_kr: string;
  checked: boolean;
  // null = not checked yet; "not_found" = checked, nothing published.
  gold: {
    age_min: number | "not_found" | null;
    age_max: number | "not_found" | null;
    cefr_levels: string[] | "not_found" | null;
    email: string | "not_found" | null;
    hook_fact: string | "not_found" | null;
    sources?: { age?: string[]; levels?: string[]; email?: string[]; hook?: string[] };
  };
  naver_raw: NaverSearchResult;
}

type HookVerdict = "supported" | "unsupported" | "contradicted" | "generic";

// ponytail: Gemini judging Gemini's hook against your one gold fact. It
// can't browse, so a true-but-different fact scores "unsupported" — treat
// the hook number as a lower bound and read the per-lead pairs in the
// result file. Swap in a different judge model if bias becomes a concern.
async function judgeHook(ai: GoogleGenAI, hook: string, goldFact: string): Promise<HookVerdict> {
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: JSON.stringify({ model_hook: hook, verified_fact: goldFact }),
    config: {
      systemInstruction: `You compare an email-opening "hook" about a Korean English academy against one fact a human verified about that academy.
- supported: the hook states the verified fact, or something it directly implies.
- contradicted: the hook conflicts with the verified fact.
- generic: the hook has no specific fact (e.g. "a hagwon in Gangnam", "an English academy for kids").
- unsupported: the hook states a specific fact the verified fact neither confirms nor contradicts.
Return JSON only.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { verdict: { type: Type.STRING, format: "enum", enum: ["supported", "unsupported", "contradicted", "generic"] } },
        required: ["verdict"],
      },
    },
  });
  return JSON.parse(response.text || "{}").verdict ?? "unsupported";
}

const MODES: EnrichMode[] = ["baseline", "grounded_full", "grounded_retrieval"];
const modeArg = process.argv.indexOf("--mode");
const MODE = (modeArg > -1 ? process.argv[modeArg + 1] : "baseline") as EnrichMode;
if (!MODES.includes(MODE)) {
  console.error(`--mode must be one of ${MODES.join(", ")}.`);
  process.exit(1);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);

async function main() {
  const entries: GoldEntry[] = JSON.parse(readFileSync("eval/gold.json", "utf8"));
  const checked = entries.filter(e => e.checked);
  for (const e of checked) {
    if (isNotFound(e.gold.age_min) !== isNotFound(e.gold.age_max)) {
      throw new Error(`${e.name_kr}: age_min and age_max must both be "not_found" or both numbers.`);
    }
  }
  if (checked.length === 0) throw new Error("No entries in eval/gold.json have checked: true yet.");
  if (checked.length < entries.length) console.warn(`Scoring ${checked.length}/${entries.length} — the rest aren't checked yet.`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set.");
  const judge = new GoogleGenAI({ apiKey });

  const ageScores: number[] = [];
  const levelScores: number[] = [];
  const emailHits: number[] = [];
  const hookVerdicts: HookVerdict[] = [];
  let falseScraped = 0;
  // Fields the human marked not_found, and how many the pipeline still filled.
  const notFound: Record<ClaimField, { total: number; claimed: number }> = {
    age: { total: 0, claimed: 0 }, levels: { total: 0, claimed: 0 }, email: { total: 0, claimed: 0 }, hook: { total: 0, claimed: 0 },
  };
  const checkNotFound = (field: ClaimField, out: EnrichedLead | null, row: Record<string, unknown>, predicted: unknown) => {
    const claimed = claimsValue(field, out);
    notFound[field].total++;
    if (claimed) notFound[field].claimed++;
    row[`${field}_not_found`] = { predicted, claimed };
  };
  let failed = 0;
  const perLead: unknown[] = [];
  // Grounded-mode metrics.
  let cited = 0, citedFailed = 0, inferredClaims = 0;
  const agreement = { agree: 0, total: 0 };
  const nfPrecision = { agree: 0, total: 0 };
  const usage = { calls: 0, input_tokens: 0, ms: 0 };
  const onUsage: UsageSink = u => { usage.calls++; usage.input_tokens += u.input_tokens; };

  for (const entry of checked) {
    const { gold } = entry;
    let out: EnrichedLead | null = null;
    let error: string | undefined;
    try {
      const started = Date.now();
      if (MODE === "baseline") {
        out = await enrichLeadServer(entry.naver_raw, onUsage);
      } else {
        const frozen = loadFrozen(entry.naver_id);
        if (!frozen) throw new Error(`no frozen sources for ${entry.name_kr} — run eval/snapshot-sources.ts`);
        out = await enrichGroundedServer(entry.naver_raw, frozen.input, MODE, { onUsage });
        frozen.saveEmbeddings();
      }
      usage.ms += Date.now() - started;
    } catch (err) {
      failed++;
      error = err instanceof Error ? err.message : String(err);
    }

    // A failed enrichment scores 0 on every metric it's measured on — an
    // honest number, not one that quietly skips the hard cases.
    const row: Record<string, unknown> = { naver_id: entry.naver_id, name_kr: entry.name_kr, error };

    if (isNotFound(gold.age_min) || isNotFound(gold.age_max)) {
      checkNotFound("age", out, row, out?.student_age_range);
    } else if (gold.age_min != null && gold.age_max != null) {
      const s = out ? ageIoU(parseAgeRange(out.student_age_range), [gold.age_min, gold.age_max]) : 0;
      ageScores.push(s);
      row.age = { predicted: out?.student_age_range, gold: [gold.age_min, gold.age_max], score: s };
    }
    if (isNotFound(gold.cefr_levels)) {
      checkNotFound("levels", out, row, out?.cefr_levels_taught);
    } else if (gold.cefr_levels) {
      const s = out ? jaccard(out.cefr_levels_taught, gold.cefr_levels) : 0;
      levelScores.push(s);
      row.levels = { predicted: out?.cefr_levels_taught, gold: gold.cefr_levels, score: s };
    }
    if (isNotFound(gold.email)) {
      checkNotFound("email", out, row, out?.email && `${out.email} (${out.email_confidence})`);
    } else if (gold.email) {
      const hit = out ? Number(sameEmail(out.email, gold.email)) : 0;
      emailHits.push(hit);
      row.email = { predicted: out?.email, confidence: out?.email_confidence, gold: gold.email, hit };
    }
    if (out?.email_confidence === "scraped" && !(gold.email && !isNotFound(gold.email) && sameEmail(out.email, gold.email))) {
      falseScraped++;
    }
    if (isNotFound(gold.hook_fact)) {
      checkNotFound("hook", out, row, out?.personalization_hook);
    } else if (gold.hook_fact) {
      const verdict: HookVerdict = out?.personalization_hook ? await judgeHook(judge, out.personalization_hook, gold.hook_fact) : "generic";
      hookVerdicts.push(verdict);
      row.hook = { predicted: out?.personalization_hook, gold: gold.hook_fact, verdict };
    }

    // Grounded-mode metrics: verification, cited-source agreement, and whether
    // the pipeline's not_found answers match the human's.
    if (out?.facts) {
      const c = citedFactCounts(out);
      cited += c.cited; citedFailed += c.failed; inferredClaims += c.inferred;
      row.facts = out.facts;
      row.grounding = out.grounding;
      const goldNotFound = { age: isNotFound(gold.age_min), levels: isNotFound(gold.cefr_levels), hook: isNotFound(gold.hook_fact) };
      const goldChecked = { age: gold.age_min != null, levels: gold.cefr_levels != null, hook: gold.hook_fact != null };
      for (const field of ["age", "levels", "hook"] as const) {
        const fact = factFor(field, out)!;
        const goldUrls = gold.sources?.[field === "levels" ? "levels" : field];
        const agrees = citedSourceAgrees(fact, goldUrls, urlHit);
        if (agrees !== null) { agreement.total++; if (agrees) agreement.agree++; }
        if (fact.status === "not_found" && goldChecked[field]) { nfPrecision.total++; if (goldNotFound[field]) nfPrecision.agree++; }
      }
    }

    perLead.push(row);
    console.log(`${error ? "FAIL" : "ok  "} ${entry.name_kr}`);
    await new Promise(r => setTimeout(r, 400));
  }

  const nfTotal = Object.values(notFound).reduce((a, b) => a + b.total, 0);
  const nfClaimed = Object.values(notFound).reduce((a, b) => a + b.claimed, 0);
  const count = (v: HookVerdict) => hookVerdicts.filter(x => x === v).length;
  const summary = {
    leads_scored: checked.length,
    enrichment_failures: failed,
    age_range_iou: mean(ageScores),
    cefr_levels_jaccard: mean(levelScores),
    email_exact_match: mean(emailHits),
    email_false_scraped: falseScraped,
    // Of the fields where the human found nothing published, the share the
    // pipeline still filled in — invented facts. Lower is better.
    not_found_claim_rate: nfTotal ? nfClaimed / nfTotal : NaN,
    not_found_claims: { total: nfTotal, claimed: nfClaimed, by_field: notFound },
    mode: MODE,
    // Grounded modes only (NaN for baseline).
    verification_failure_rate: rate(citedFailed, cited),
    facts_cited: cited,
    inferred_claims: inferredClaims,
    cited_source_agreement: rate(agreement.agree, agreement.total),
    cited_source_agreement_n: agreement.total,
    not_found_precision: rate(nfPrecision.agree, nfPrecision.total),
    not_found_precision_n: nfPrecision.total,
    calls_per_lead: rate(usage.calls, checked.length - failed),
    input_tokens_per_lead: rate(usage.input_tokens, checked.length - failed),
    seconds_per_lead: rate(usage.ms / 1000, checked.length - failed),
    hook_supported: hookVerdicts.length ? count("supported") / hookVerdicts.length : NaN,
    hook_verdicts: {
      supported: count("supported"),
      unsupported: count("unsupported"),
      contradicted: count("contradicted"),
      generic: count("generic"),
    },
  };

  const sha = execSync("git rev-parse --short HEAD").toString().trim();
  const dirty = execSync("git status --porcelain").toString().trim() ? "-dirty" : "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("eval/results", { recursive: true });
  const outPath = `eval/results/${MODE}-${sha}${dirty}-${stamp}.json`;
  writeFileSync(outPath, JSON.stringify({ mode: MODE, commit: `${sha}${dirty}`, summary, perLead }, null, 2) + "\n");

  console.log(`
Pipeline ${MODE} @ ${sha}${dirty} — ${checked.length} leads, ${failed} failed
  Age range (IoU)         ${pct(summary.age_range_iou)}  (n=${ageScores.length})
  CEFR levels (Jaccard)   ${pct(summary.cefr_levels_jaccard)}  (n=${levelScores.length})
  Email exact match       ${pct(summary.email_exact_match)}  (n=${emailHits.length}, leads with a real email)
  "scraped" but wrong     ${falseScraped}
  Claims where nothing findable ${pct(summary.not_found_claim_rate)}  (${nfClaimed}/${nfTotal} not_found fields still filled; lower is better)
  Verification failures   ${pct(summary.verification_failure_rate)}  (${citedFailed}/${cited} cited facts; grounded modes)
  Cited-source agreement  ${pct(summary.cited_source_agreement)}  (n=${agreement.total})
  not_found precision     ${pct(summary.not_found_precision)}  (n=${nfPrecision.total}; ${inferredClaims} inferred claims)
  Per lead                ${Number.isNaN(summary.calls_per_lead) ? "n/a" : `${summary.calls_per_lead.toFixed(1)} calls, ${Math.round(summary.input_tokens_per_lead)} input tokens, ${summary.seconds_per_lead.toFixed(1)}s`}
  Hook supported          ${pct(summary.hook_supported)}  (${JSON.stringify(summary.hook_verdicts)})
Full results: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
