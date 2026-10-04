// Scores the current pipeline (enrichLeadServer, as checked out) against the
// hand-checked answers in eval/gold.json. To score another version, check
// out that commit and run this again — the result file records the commit.
//
//   npm run eval
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GoogleGenAI, Type } from "@google/genai";
import { enrichLeadServer } from "../src/lib/serverActions";
import type { EnrichedLead, NaverSearchResult } from "../src/types";
import { parseAgeRange, ageIoU, jaccard, sameEmail } from "./score";

interface GoldEntry {
  naver_id: string;
  name_kr: string;
  checked: boolean;
  gold: {
    age_min: number | null;
    age_max: number | null;
    cefr_levels: string[] | null;
    email: string | null;
    hook_fact: string | null;
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

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);

async function main() {
  const entries: GoldEntry[] = JSON.parse(readFileSync("eval/gold.json", "utf8"));
  const checked = entries.filter(e => e.checked);
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
  let failed = 0;
  const perLead: unknown[] = [];

  for (const entry of checked) {
    const { gold } = entry;
    let out: EnrichedLead | null = null;
    let error: string | undefined;
    try {
      out = await enrichLeadServer(entry.naver_raw);
    } catch (err) {
      failed++;
      error = err instanceof Error ? err.message : String(err);
    }

    // A failed enrichment scores 0 on every metric it's measured on — an
    // honest number, not one that quietly skips the hard cases.
    const row: Record<string, unknown> = { naver_id: entry.naver_id, name_kr: entry.name_kr, error };

    if (gold.age_min != null && gold.age_max != null) {
      const s = out ? ageIoU(parseAgeRange(out.student_age_range), [gold.age_min, gold.age_max]) : 0;
      ageScores.push(s);
      row.age = { predicted: out?.student_age_range, gold: [gold.age_min, gold.age_max], score: s };
    }
    if (gold.cefr_levels) {
      const s = out ? jaccard(out.cefr_levels_taught, gold.cefr_levels) : 0;
      levelScores.push(s);
      row.levels = { predicted: out?.cefr_levels_taught, gold: gold.cefr_levels, score: s };
    }
    if (gold.email) {
      const hit = out ? Number(sameEmail(out.email, gold.email)) : 0;
      emailHits.push(hit);
      row.email = { predicted: out?.email, confidence: out?.email_confidence, gold: gold.email, hit };
    }
    if (out?.email_confidence === "scraped" && !(gold.email && sameEmail(out.email, gold.email))) {
      falseScraped++;
    }
    if (gold.hook_fact) {
      const verdict: HookVerdict = out?.personalization_hook ? await judgeHook(judge, out.personalization_hook, gold.hook_fact) : "generic";
      hookVerdicts.push(verdict);
      row.hook = { predicted: out?.personalization_hook, gold: gold.hook_fact, verdict };
    }

    perLead.push(row);
    console.log(`${error ? "FAIL" : "ok  "} ${entry.name_kr}`);
    await new Promise(r => setTimeout(r, 400));
  }

  const count = (v: HookVerdict) => hookVerdicts.filter(x => x === v).length;
  const summary = {
    leads_scored: checked.length,
    enrichment_failures: failed,
    age_range_iou: mean(ageScores),
    cefr_levels_jaccard: mean(levelScores),
    email_exact_match: mean(emailHits),
    email_false_scraped: falseScraped,
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
  const outPath = `eval/results/${sha}${dirty}-${stamp}.json`;
  writeFileSync(outPath, JSON.stringify({ commit: `${sha}${dirty}`, summary, perLead }, null, 2) + "\n");

  console.log(`
Pipeline @ ${sha}${dirty} — ${checked.length} leads, ${failed} failed
  Age range (IoU)         ${pct(summary.age_range_iou)}  (n=${ageScores.length})
  CEFR levels (Jaccard)   ${pct(summary.cefr_levels_jaccard)}  (n=${levelScores.length})
  Email exact match       ${pct(summary.email_exact_match)}  (n=${emailHits.length}, leads with a real email)
  "scraped" but wrong     ${falseScraped}
  Hook supported          ${pct(summary.hook_supported)}  (${JSON.stringify(summary.hook_verdicts)})
Full results: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
