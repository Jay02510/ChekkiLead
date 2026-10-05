// Shared server-side logic for the three API operations, called from both
// server.ts (Express, local dev) and api/*.ts (Vercel serverless, prod) so a
// fix here doesn't have to be made twice. Node/server-only — never imported
// from client code (src/App.tsx etc), so Vite won't bundle this into the browser.
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, EMAIL_SYSTEM_PROMPT, ENRICH_SCHEMA, EMAIL_SCHEMA } from "./geminiPrompts.js";
import { getNaverId } from "./naverId.js";
import { englishSignal } from "./leadFilter.js";
import { EnrichedLeadSchema, EmailDraftSchema } from "./validation.js";
import type { EnrichedLead, EmailDraft, NaverSearchResult } from "../types";

function genaiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured on the server.");
  return new GoogleGenAI({ apiKey });
}

// Gemini occasionally 503s under load ("model is currently experiencing high
// demand") — one retry clears most of these instead of failing the lead outright.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const message = String(err?.message || "");
    // A quota error isn't malformed output and a second call fails the same
    // way — surface it as-is so the UI says what actually happened.
    if (message.includes("RESOURCE_EXHAUSTED") || err?.status === 429) {
      const wait = message.match(/retry in ([\d.]+)s/i)?.[1];
      throw Object.assign(
        new Error(`Gemini quota hit${wait ? ` — retry in ${Math.ceil(Number(wait))}s` : ""}. Free tier allows 5 requests/minute; enable billing on the API key or enrich fewer leads at once.`),
        { status: 429, quota: true },
      );
    }
    if (message.includes("UNAVAILABLE") || message.includes("503")) {
      await new Promise(res => setTimeout(res, 1500));
      return await fn();
    }
    throw err;
  }
}

export async function searchNaver(query: string, start: number | string) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("Naver API credentials not configured."), { status: 500 });
  }
  if (!query) {
    throw Object.assign(new Error("Query parameter is required."), { status: 400 });
  }

  const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&start=${start}`, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (response.status === 429) {
    throw Object.assign(new Error("Naver API rate limit hit — wait a moment before searching again."), { status: 429 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Naver API responded with ${response.status}`), { status: 500 });
  }
  return response.json();
}

// Never trust the model for fields the code already knows from the raw
// Naver result — if the model alters naver_id, dedupe breaks (an
// opted-out academy could be re-added and re-contacted); drifted
// phone/address would silently corrupt data the model didn't actually derive.
export function applyNaverTruth(item: NaverSearchResult, parsed: EnrichedLead): EnrichedLead {
  return {
    ...parsed,
    naver_id: getNaverId(item),
    phone: item.telephone,
    address_full: item.roadAddress || item.address,
    firebase_status: 'not_contacted',
    // Kept so any lead can be re-run through a future pipeline version.
    naver_raw: item,
    // Whether English is named in the listing is a fact about the input, so
    // code sets it. "none" never reaches here (the callers filter it out).
    english_signal: englishSignal(item) === "confirmed" ? "confirmed" : "unsure",
    needs_review: englishSignal(item) !== "confirmed",
  };
}

export async function enrichLeadServer(item: NaverSearchResult): Promise<EnrichedLead> {
  if (!item) throw Object.assign(new Error("item is required."), { status: 400 });

  const ai = genaiClient();
  let lastError: unknown;

  // One retry covers a malformed-JSON or schema-validation failure, same as
  // withRetry covers a transient 503 — either way, a malformed lead is never
  // returned (and so never saved) without at least one second attempt.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const naverId = getNaverId(item);
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: JSON.stringify({ ...item, naver_id: naverId, english_signal: englishSignal(item) }),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: ENRICH_SCHEMA,
        },
      }));

      const text = response.text;
      if (!text) throw new Error("No response from Gemini.");
      const candidate = applyNaverTruth(item, JSON.parse(text));
      return EnrichedLeadSchema.parse(candidate) as EnrichedLead;
    } catch (err) {
      if ((err as any)?.quota) throw err;
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw Object.assign(new Error(`Gemini returned a malformed lead after retry: ${message}`), { status: 502 });
}

// Korea's 정보통신망법 (Act on Promotion of Information and Communications
// Network Utilization), Article 50, requires commercial email to carry an
// "(광고)" subject prefix, sender contact info, and a working opt-out —
// applied here as a fixed footer rather than left to the model, since a
// legally-required string shouldn't be at the mercy of prompt drift.
const COMPLIANCE_FOOTER_KR = `\n\n---\n본 메일은 정보통신망 이용촉진 및 정보보호 등에 관한 법률에 따라 발송되는 광고성 정보입니다.\n발신자: Chekki AI (contact@chekkiai.com)\n수신을 원치 않으시면 본 메일에 "수신거부"라고 회신해 주세요. 즉시 반영해 드리겠습니다.`;
const COMPLIANCE_FOOTER_EN = `\n\n---\nThis is a commercial email sent in accordance with Korea's Act on Promotion of Information and Communications Network Utilization.\nSender: Chekki AI (contact@chekkiai.com)\nReply "unsubscribe" if you'd rather not hear from us again — we'll action it right away.`;

export function applyEmailCompliance(draft: EmailDraft): EmailDraft {
  return {
    ...draft,
    subject_line_kr: `(광고) ${draft.subject_line_kr}`,
    subject_combined: `(광고) ${draft.subject_combined}`,
    subject_line_kr_b: `(광고) ${draft.subject_line_kr_b}`,
    subject_combined_b: `(광고) ${draft.subject_combined_b}`,
    body_korean: `${draft.body_korean}${COMPLIANCE_FOOTER_KR}`,
    body_english: `${draft.body_english}${COMPLIANCE_FOOTER_EN}`,
  };
}

export async function generateEmailServer(lead: EnrichedLead): Promise<EmailDraft> {
  if (!lead) throw Object.assign(new Error("lead is required."), { status: 400 });

  const ai = genaiClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: JSON.stringify(lead),
        config: {
          systemInstruction: EMAIL_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: EMAIL_SCHEMA,
        },
      }));

      const text = response.text;
      if (!text) throw new Error("No response from Gemini.");
      const candidate = EmailDraftSchema.parse(JSON.parse(text)) as EmailDraft;
      return applyEmailCompliance(candidate);
    } catch (err) {
      if ((err as any)?.quota) throw err;
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw Object.assign(new Error(`Gemini returned a malformed email draft after retry: ${message}`), { status: 502 });
}
