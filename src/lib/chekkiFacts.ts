// Single source of truth for facts about Chekki AI / Chekki Schools / the
// founder, interpolated into both SYSTEM_PROMPT (enrichment) and
// EMAIL_SYSTEM_PROMPT (email drafting) in geminiPrompts.ts. The two prompts
// used to each hardcode their own copy of these facts and drifted apart —
// the AI Readiness Check's stated duration said "2-minute" in the email
// prompt while the real diagnostic takes about 4 minutes.

export const PRODUCT = `Chekki AI, a freemium app that grades English worksheets via photo scan and gives pronunciation coaching — built for Korean parents who don't have time or English proficiency to check homework themselves.`;

export const CHEKKI_SCHOOLS = `Chekki Schools — hagwon partnership program. When an academy signs up, its enrolled parents get free premium Chekki AI access, including a KakaoTalk parent-reporting feature teachers can use to send progress updates directly to parents.`;

export const FOUNDER_BACKGROUND = `Jason — 10+ years EFL teaching in Seoul (private schools, English Villages, including YBM PSA and Blend ENG Academy), Master's in Education with a curriculum development focus, and created 10+ textbooks for his previous hagwon. Former managerial role at a hagwon — this is where the Chekki concept originated (curriculum-pace mismatch with student levels, parents unable to support homework at home).`;

// ---------- outreach email (EMAIL_SYSTEM_PROMPT only) ----------
// FOUNDER_BACKGROUND above is interpolated into the frozen baseline enrichment
// prompts, so it can't change without breaking the eval's control. It
// overstates one thing (Jason never held a managerial role at a hagwon), which
// is why the email reads FOUNDER_EMAIL instead. Source: Chekki-Brain facts.md.
export const FOUNDER_EMAIL = `Jason Benjamin — 10+ years teaching English in Seoul (private schools and English Villages), Master's in Education with a curriculum development focus, and wrote 10+ textbooks used in a hagwon he taught at. He has never managed or owned a hagwon: never say or imply he did.`;

// The workbook. Audio is AI voices: never 원어민 / "native speaker".
export const WORKBOOK = `체키 영어 1: 첫 문장 읽기 — a 72-page English reading workbook for ages 4–7 (first sentences), with QR audio in four voices. Volume 1 of a planned series.`;
export const WORKBOOK_SAMPLER_PAGES = 9;
export const WORKBOOK_SAMPLER_URL_KR = "https://chekkiai.gumroad.com/l/chekki-english-sampler-ko?utm_source=email&utm_medium=email&utm_campaign=schools_sampler";
