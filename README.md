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
- `src/lib/geminiPrompts.ts` holds the system prompts and response schemas — edit positioning/CTA copy there.
- `src/lib/naverId.ts` derives a stable dedupe key per business, since Naver's Local Search API doesn't return one.
- **Before sending real outreach:** confirm your Firestore security rules aren't left in test mode (`allow read, write: if true`) — the project ID is visible in the client bundle by design, so rules are the actual access control.

