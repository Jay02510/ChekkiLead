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

## Architecture notes

- All external API calls (Naver, Gemini) happen server-side in `server.ts`. The client never holds an API key.
- `src/lib/geminiPrompts.ts` holds the system prompts and response schemas — edit positioning/CTA copy there. `src/lib/chekkiFacts.ts` holds the shared product/founder facts both prompts interpolate, so they can't drift apart.
- `src/lib/naverId.ts` derives a stable dedupe key per business, since Naver's Local Search API doesn't return one.
- The app is gated behind Google sign-in (`src/AuthGate.tsx`); Firestore rules (`firestore.rules`) only allow read/write from one allowlisted owner email. The project ID is visible in the client bundle by design, so rules are the actual access control — deploy `firestore.rules` and don't widen it.

## Data provenance

Every saved lead mixes real data from Naver with fields Gemini estimates. Before relying on a field, know which kind it is:

- **From Naver (ground truth, never model-estimated):** `institution_name_*` (source name, HTML-stripped), `phone`, `address_full`, `naver_id`. `enrichLeadServer` overwrites these from the raw Naver result after Gemini responds, specifically so the model can't drift them (see `applyNaverTruth` in `src/lib/serverActions.ts`).
- **Model estimates (Gemini, not verified against any external source):** `institution_type`, `student_age_range`, `approx_students`, `cefr_levels_taught`, `outreach_priority`, `fit_reason`, `agent_notes`, `personalization_hook`, and `email` whenever `email_confidence` isn't `scraped`.
- **Email specifically:** `email_confidence` tells you how much to trust `email`. `scraped` means it was found on the academy's site. `estimated` means Gemini constructed a plausible address from a domain or naming pattern — **verify it manually (e.g. on the academy's own site) before sending**, and mark it verified via the lead card so it isn't blocked from bulk sending. `unknown` means don't send to it at all; the app blocks `unknown`-confidence and unverified `estimated` addresses from both the single-lead and bulk "Mark Sent" actions.

