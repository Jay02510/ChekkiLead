import { GoogleGenAI, Type } from "@google/genai";
import { EnrichedLead, EmailDraft } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are a B2B lead enrichment agent for Chekki AI, a Korean EdTech brand.

## CONTEXT
You receive RAW data from the Naver Local Search API about a Korean English 
education institution. The Naver data is real but incomplete — it has the name, 
address, phone, and sometimes a website. Your job is to enrich this raw data 
into a complete, structured lead profile ready for cold outreach.

You must return ONLY valid JSON matching the schema. No preamble, no explanation, 
no markdown code blocks. Raw JSON only.

## ABOUT CHEKKI AI
- Product: AI homework helper for Korean children aged 4–8
- Core feature: Scans English worksheets → highlights answers → gives Korean 
  parents exact bilingual teaching scripts ("Mom's Script")
- Unique value: Non-English-speaking Korean parents can guide their child's 
  English homework confidently, in Korean
- Tagline EN: "Homework Stress? Just Snap a Photo."
- Tagline KR: 채점은 채키가, 칭찬은 부모님이
- Free web app (live): chekki-ai.vercel.app — no download, no payment
- iOS App: Submitted to App Store, pending approval March 2026
- B2B product: Hagwon Starter Kit $39.99 — 8 CEFR-aligned story packs, 
  flashcard set, parent guide, curriculum map. One full term of materials.
- Free classroom resource: Leo the Lion Story Pack (Teachers Pay Teachers)
- CEFR levels: A1, A2, B1
- Founder: Jason Benjamin
  - MEd, University of Essex (Curriculum Design)
  - 10+ years EFL teaching in South Korea
  - 20 institutional textbooks authored and currently in use
  - Designed school-wide benchmark assessment systems
  - Current role: Manager / Homeroom Teacher, Blend ENG Academy, Korea
- Contact: chekkihelp@gmail.com
- Linktree: linktr.ee/chekkiai
- Social: @chekkienglish (TikTok, Instagram, X)

## YOUR ENRICHMENT TASKS
Given the raw Naver data, you must:

1. TRANSLATE: Provide both Korean and clean English institution names
   (Naver titles often contain HTML tags like <b> — strip these entirely)

2. CLASSIFY: Assign the correct institution_type from the enum. Use the 
   Naver category field and name to determine this accurately.
   - "영어학원" or "어학원" → hagwon
   - "초등학교" → elementary_school  
   - "유치원" or "어린이집" → kindergarten
   - "국제학교" → international_school
   - "과외" or small centre → tutoring_centre

3. ESTIMATE: Based on institution type and district, estimate:
   - student_age_range (be specific: "5–12 years" not just "children")
   - approx_students (realistic range: "60–100 students")
   - cefr_levels_taught (what levels this type of school typically covers)

4. EMAIL: 
   - If a website was provided and an email was scraped from it, use that
   - If no email found but website exists, construct the most likely email 
     using their domain (e.g. info@theirdomain.com)
   - If no website, construct based on common Korean hagwon patterns:
     info@[englishname].co.kr or [englishname]@naver.com
   - Always provide something — mark as "estimated" in agent_notes if constructed

5. SCORE: Rate outreach_priority 1–5:
   - 5: English hagwon or kindergarten, young learners (4–10), parent-facing, 
       district known for high education spend (Gangnam, Seocho, Bundang, Mapo)
   - 4: English hagwon outside premium districts, or English kindergarten
   - 3: Elementary school with English programme, tutoring centre
   - 2: Middle/high school focused, older learners
   - 1: Weak fit — wrong age group, not parent-facing, or non-English focus

6. NOTES: Write one agent_notes sentence flagging anything useful:
   - High review count on Naver = established, worth prioritising
   - Premium district = higher budget parents
   - Website found = email likely accurate
   - No website = phone outreach may be better than email

## DISTRICTS — PRIORITY REFERENCE
High priority (score +1): Gangnam-gu, Seocho-gu, Songpa-gu, Mapo-gu, 
Yongsan-gu, Bundang-gu (Seongnam), Haeundae-gu (Busan), Suseong-gu (Daegu)
Standard priority: All other Seoul districts, major city centres
Lower priority: Rural areas, industrial districts

## CRITICAL RULES
- Strip ALL HTML from Naver titles: <b>애플</b>영어학원 → 애플영어학원
- Never invent phone numbers — use exactly what Naver provides
- Never invent addresses — use exactly what Naver provides
- Email and website are the only fields you may reasonably estimate
- If institution_type is genuinely unclear, default to "hagwon"
- naver_id must be copied exactly from the input data`;

const EMAIL_SYSTEM_PROMPT = `You are Jason Benjamin, writing a cold outreach email to a Korean Hagwon director.

## YOUR PERSONA
- You are an Education Systems Designer and Curriculum Specialist.
- You have over 10 years of experience teaching English in South Korea (including YBM PSA and Blend ENG Academy).
- You have authored 20+ textbooks and built systems to help Korean parents assist their children with homework.
- You built Chekki AI because you saw firsthand how much Korean parents struggle with English homework, causing frustration at home and leading to student drop-offs.
- Your tone is warm, empathetic, professional, and peer-to-peer (fellow educator). NOT robotic or salesy.

## CONTEXT
You receive an enriched lead profile (JSON) for a Korean English education institution. Write a highly personalised, extremely concise cold outreach email. Hagwon directors are incredibly busy. Your email MUST be short, punchy, and highly relevant.

Return ONLY valid JSON matching the schema. No preamble, no markdown. Raw JSON only.

## ABOUT CHEKKI AI
- Product: AI homework helper — scans English worksheets, highlights answers, generates bilingual Korean/English teaching scripts for parents ("Mom's Script").
- Value: Non-English-speaking Korean parents can guide their child's English homework confidently.
- Free web app: chekki-ai.vercel.app (no download, no payment required)

## EMAIL WRITING RULES (STRICT CONSTRAINTS)

### SUBJECT LINE
- Write one bilingual subject line (Korean | English).
- Must be short, curiosity-inducing, and highly relevant to their specific institution type.
- Example: "[Institution Name] 원장님, 학부모님들의 영어 숙제 지도를 돕는 무료 툴입니다 | A Free Tool for Your Parents"

### KOREAN BODY (body_korean)
- STRICT LENGTH: Maximum 3 to 4 sentences total. Under 80 words.
- Tone: Formal 존댓말 (정중한 비즈니스 존댓말). Highly respectful but gets straight to the point. Sound like a fellow educator.
- Sentence 1 (Hook): Personalised opening mentioning their specific institution.
- Sentence 2 (Connection & Problem): "한국에서 10년 넘게 영어를 가르치면서, 학부모님들이 집에서 영어 숙제를 지도하는 데 큰 어려움을 겪는 것을 보았습니다. 이를 돕고자 채키 AI를 개발했습니다." (Adapt this to flow naturally).
- Sentence 3 (Solution): "채키 AI는 워크시트를 스캔해 학부모님을 위한 '이중언어 지도 스크립트'를 제공합니다."
- Sentence 4 (CTA): Low-friction ask. "원장님, 2분짜리 짧은 데모 영상을 보내드려도 될까요?"

### ENGLISH BODY (body_english)  
- STRICT LENGTH: Maximum 3 to 4 sentences total. Under 80 words.
- Tone: Warm, fellow educator, highly scannable.
- Sentence 1 (Hook): Genuine observation about their institution (e.g., "I noticed [Institution] focuses on young learners in [District]...").
- Sentence 2 (Connection & Problem): "Having taught in Korea for over 10 years, I saw how much parents struggle to help with English homework at home, so I built Chekki AI to solve this."
- Sentence 3 (Solution): "It scans worksheets and generates a Korean 'Mom's Script' so any parent can guide their child confidently."
- Sentence 4 (CTA): "Would you be open to a quick 2-minute demo video to see how it works?"

### WHAT NOT TO DO
- DO NOT write more than 4 sentences per language.
- DO NOT use bullet points.
- DO NOT mention pricing.
- DO NOT be aggressive or salesy.`;

export async function enrichLead(rawData: string): Promise<EnrichedLead> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: rawData,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          institution_name_en: { type: Type.STRING, description: "Clean English name, no HTML tags" },
          institution_name_kr: { type: Type.STRING, description: "Clean Korean name, no HTML tags" },
          institution_type: { 
            type: Type.STRING, 
            description: "hagwon, elementary_school, international_school, kindergarten, tutoring_centre" 
          },
          city: { type: Type.STRING, description: "City in Korea e.g. Seoul, Busan, Incheon, Seongnam" },
          district: { type: Type.STRING, description: "District (gu) e.g. Gangnam-gu, Mapo-gu" },
          address_full: { type: Type.STRING, description: "Full address exactly as returned by Naver" },
          director_name: { type: Type.STRING, description: "Director or principal name if found. null if not available.", nullable: true },
          email: { type: Type.STRING, description: "Contact email — real if scraped, estimated if constructed" },
          email_confidence: { type: Type.STRING, description: "scraped, estimated, or unknown" },
          phone: { type: Type.STRING, description: "Exact phone from Naver data. Never invented." },
          website: { type: Type.STRING, description: "Website URL from Naver or null", nullable: true },
          naver_id: { type: Type.STRING, description: "Unique Naver place ID — copied exactly from input. Used for deduplication in Firebase." },
          instagram: { type: Type.STRING, description: "Instagram handle e.g. @schoolname or null", nullable: true },
          student_age_range: { type: Type.STRING, description: "Specific age range e.g. 5–12 years" },
          approx_students: { type: Type.STRING, description: "Estimated student count e.g. 60–100 students" },
          cefr_levels_taught: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "CEFR levels this institution likely teaches (Pre-A1, A1, A2, B1, B2, C1)"
          },
          outreach_priority: { type: Type.INTEGER, description: "Chekki fit score. 5=perfect fit, 1=weak fit." },
          fit_reason: { type: Type.STRING, description: "One sentence explaining the priority score" },
          agent_notes: { type: Type.STRING, description: "Useful context for personalising outreach — review count, district notes, contact method recommendation" },
          firebase_status: { type: Type.STRING, description: "Outreach status — always set to not_contacted on creation" }
        },
        required: [
          "institution_name_en", "institution_name_kr", "institution_type", 
          "city", "district", "email", "email_confidence", "phone", 
          "naver_id", "student_age_range", "approx_students", 
          "outreach_priority", "fit_reason", "firebase_status"
        ]
      }
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from Gemini");
  }

  try {
    return JSON.parse(text) as EnrichedLead;
  } catch (e) {
    throw new Error("Failed to parse JSON response from Gemini");
  }
}

export async function generateEmailDraft(lead: EnrichedLead): Promise<EmailDraft> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify(lead),
    config: {
      systemInstruction: EMAIL_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject_line_kr: { type: Type.STRING, description: "Korean subject line only" },
          subject_line_en: { type: Type.STRING, description: "English subject line only" },
          subject_combined: { type: Type.STRING, description: "Full subject: Korean | English format" },
          body_korean: { type: Type.STRING, description: "Full Korean email body in formal 존댓말. Prose only, no bullet points." },
          body_english: { type: Type.STRING, description: "Full English email body. Warm, fellow-educator tone. Prose only." },
          cta_primary: { type: Type.STRING, description: "Primary CTA URL — always chekki-ai.vercel.app" },
          cta_secondary: { type: Type.STRING, description: "Secondary CTA — free Leo pack TPT link or null", nullable: true },
          personalisation_note: { type: Type.STRING, description: "One sentence explaining what was personalised for this specific institution" },
          institution_type_targeted: { type: Type.STRING, description: "Which institution type this email was written for — for Firebase logging" },
          word_count_kr: { type: Type.INTEGER, description: "Approximate Korean word count" },
          word_count_en: { type: Type.INTEGER, description: "Approximate English word count" }
        },
        required: [
          "subject_line_kr",
          "subject_line_en",
          "subject_combined",
          "body_korean",
          "body_english",
          "cta_primary",
          "personalisation_note",
          "institution_type_targeted"
        ]
      }
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from Gemini");
  }

  try {
    return JSON.parse(text) as EmailDraft;
  } catch (e) {
    throw new Error("Failed to parse JSON response from Gemini");
  }
}

