<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Chekki Lead Gen

Naver Local Search → Gemini enrichment → Firebase-backed lead database for Chekki Schools hagwon outreach.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY` — used server-side only (server.ts). Never sent to the browser.
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — from the Naver Developers console, powers the Local Search tab.
   - `VITE_FIREBASE_*` — optional. Omit to use the existing default `chekkiai-leadgen` project; set these to point at a different Firebase project instead.
3. Run the app:
   `npm run dev`
4. Open http://localhost:3000

## How a lead gets made (v2)

```
searchPlan.ts          152 queries: 38 동 × 4 keywords, each prefixed with its 구
   ↓                   (a 구-only query returns the same top 5 big academies;
                        a bare 동 name is ambiguous across cities)
cron-sweep             Naver Local, 12 queries/run. Dedupe → contact blocklist
   ↓                   → isLikelyTarget. Saves what Naver returned, nothing else:
                        enrichment_status "queued", no Gemini call.
cron-enrich            2 queued leads/run, stops at 45s. One Gemini call each.
   ↓
collect-sources        Their own site and blog, plus third-party blog results.
   ↓                   800-char chunks, tagged blog_own / blog_third_party / website.
grounded enrichment    Answers only from the chunks, citing a chunk id and a
   ↓                   verbatim quote per fact. verifyFacts re-checks every quote
                        inside the cited chunk in plain code; a fact that fails
                        verification is dropped, not downgraded.
Review queue           Leads whose Naver listing didn't name English wait for a
   ↓                   human (englishSignal, computed in code). They cannot be
                        marked sent.
drafting               Only from a hook that passed verification or that a person
                        typed in. No hook, no draft. (광고) prefix and the
                        정보통신망법 footer are applied in code, not by the model.
```

Two collections, by design:

- **`leads`** — read-only history. Everything the original pipeline produced. It is the contact blocklist (anything sent, replied, bounced, opted out or deleted is never contacted again, per 정보통신망법 Article 50), it holds the eval's gold leads and their collected sources, and it is the "before" half of any comparison. Client writes are off in `firestore.rules`; only Admin SDK scripts touch it.
- **`leads_v2`** — the active collection. Only the pipeline above writes to it. `leads_v2_dev` is the same thing for `npm run dev`.

Names live in `src/lib/collections.ts` so client and server can't disagree.

## Architecture notes

- All external API calls (Naver, Gemini) happen server-side in `server.ts`. The client never holds an API key.
- `src/lib/geminiPrompts.ts` holds the system prompts and response schemas — edit positioning/CTA copy there. `src/lib/chekkiFacts.ts` holds the shared product/founder facts both prompts interpolate, so they can't drift apart.
- `src/lib/naverId.ts` derives a stable dedupe key per business, since Naver's Local Search API doesn't return one.
- The app is gated behind Google sign-in (`src/AuthGate.tsx`); Firestore rules (`firestore.rules`) only allow read/write from one allowlisted owner email. The project ID is visible in the client bundle by design, so rules are the actual access control — deploy `firestore.rules` and don't widen it.

## Data provenance

Every saved lead mixes real data from Naver with fields a model produced. Before relying on a field, know which kind it is. **The "model estimates" row below describes `leads` (history) and the `baseline` path — a grounded lead in `leads_v2` carries a `facts` object instead, where every value has a status, a cited chunk, a verbatim quote and a code-checked verification result.**

- **From Naver (ground truth, never model-estimated):** `institution_name_*` (source name, HTML-stripped), `phone`, `address_full`, `naver_id`. `enrichLeadServer` overwrites these from the raw Naver result after Gemini responds, specifically so the model can't drift them (see `applyNaverTruth` in `src/lib/serverActions.ts`).
- **Model estimates (Gemini, not verified against any external source):** `institution_type`, `student_age_range`, `approx_students`, `cefr_levels_taught`, `outreach_priority`, `fit_reason`, `agent_notes`, `personalization_hook`, and `email` whenever `email_confidence` isn't `scraped`.
- **Email specifically:** `email_confidence` tells you how much to trust `email`. `scraped` means it was found on the academy's site. `estimated` means Gemini constructed a plausible address from a domain or naming pattern — **verify it manually (e.g. on the academy's own site) before sending**, and mark it verified via the lead card so it isn't blocked from bulk sending. `unknown` means don't send to it at all; the app blocks `unknown`-confidence and unverified `estimated` addresses from both the single-lead and bulk "Mark Sent" actions.


## Eval

`npm run eval` scores the current enrichment pipeline against `eval/gold.json`, a set of leads whose true facts were checked by hand. Only entries with `checked: true` are scored. Each result file in `eval/results/` records the commit it ran on.

Gold fields have three states:

- `null`: not checked yet. The eval skips it.
- a value: the true answer, with the source URLs that prove it in `sources`.
- `"not_found"`: you looked and nothing is published. Allowed for `age_min`/`age_max` (both together), `cefr_levels`, `email` and `hook_fact`. The eval then reports **claims where nothing findable**: the share of `not_found` fields where the pipeline still returned a value (for email, an estimated address counts as a claim). That is the "invents facts" failure; lower is better.

**email_rule:** a gold `email` must be specific to that branch or academy, and published by it. A company-wide address such as `ybmgroup@ybm.co.kr` doesn't count. If only a company-wide address exists, mark `email` as `"not_found"`.

Gold answers are never drafted by a model. Grading the pipeline against another model's reading of the same pages would measure agreement, not truth.

### Modes compared

| mode | what it is |
|---|---|
| `baseline_v0` | the original prompt, restored byte-for-byte from commit `22bc257`. Told to "always provide something" and to "construct the most likely email". Kept only to measure what it invented. |
| `baseline` | that prompt after the guessing was removed. The control. |
| `grounded_full` | answers from the collected chunks, up to 40,000 characters, own sources first. |
| `grounded_retrieval` | answers from the top 6 chunks per field query, retrieved by embedding (`gemini-embedding-001`, 256 dims, cosine in plain TypeScript). |

### Results

Not yet measured. The eval needs Gemini billing on (the free tier's 5 requests/minute cannot finish a run) and every gold entry hand-checked.

| metric | `baseline_v0` | `baseline` | `grounded_full` | `grounded_retrieval` |
|---|---|---|---|---|
| age accuracy (IoU) | — | — | — | — |
| CEFR levels (Jaccard) | — | — | — | — |
| email exact match | — | — | — | — |
| claims where nothing findable | — | — | — | — |
| verification failure rate | n/a | n/a | — | — |

`DEFAULT_GROUNDED_MODE` in `src/lib/rag/ground.ts` is currently `grounded_full` — a placeholder, not a measured winner. If neither grounded mode beats `baseline` on accuracy, the honest move is to keep `baseline` and say so here.
