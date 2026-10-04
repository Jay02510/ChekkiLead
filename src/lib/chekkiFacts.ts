// Single source of truth for facts about Chekki AI / Chekki Schools / the
// founder, interpolated into both SYSTEM_PROMPT (enrichment) and
// EMAIL_SYSTEM_PROMPT (email drafting) in geminiPrompts.ts. The two prompts
// used to each hardcode their own copy of these facts and drifted apart —
// the AI Readiness Check's stated duration said "2-minute" in the email
// prompt while the real diagnostic takes about 4 minutes.

export const PRODUCT = `Chekki AI, a freemium app that grades English worksheets via photo scan and gives pronunciation coaching — built for Korean parents who don't have time or English proficiency to check homework themselves.`;

export const CHEKKI_SCHOOLS = `Chekki Schools — hagwon partnership program. When an academy signs up, its enrolled parents get free premium Chekki AI access, including a KakaoTalk parent-reporting feature teachers can use to send progress updates directly to parents.`;

export const FOUNDER_BACKGROUND = `Jason — 10+ years EFL teaching in Seoul (private schools, English Villages, including YBM PSA and Blend ENG Academy), Master's in Education with a curriculum development focus, and created 10+ textbooks for his previous hagwon. Former managerial role at a hagwon — this is where the Chekki concept originated (curriculum-pace mismatch with student levels, parents unable to support homework at home).`;

export const AI_READINESS_CHECK_MINUTES = 4;

export const AI_READINESS_CHECK_EN = `a free ${AI_READINESS_CHECK_MINUTES}-minute AI-readiness diagnostic that sends a personalized report by email`;
export const AI_READINESS_CHECK_KR = `${AI_READINESS_CHECK_MINUTES}분이면 끝나는 무료 진단`;
