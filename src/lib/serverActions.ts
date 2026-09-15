// Shared server-side logic for the three API operations, called from both
// server.ts (Express, local dev) and api/*.ts (Vercel serverless, prod) so a
// fix here doesn't have to be made twice. Node/server-only — never imported
// from client code (src/App.tsx etc), so Vite won't bundle this into the browser.
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, EMAIL_SYSTEM_PROMPT, ENRICH_SCHEMA, EMAIL_SCHEMA } from "./geminiPrompts.js";
import type { EnrichedLead, EmailDraft } from "../types";

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

export async function enrichLeadServer(rawData: string): Promise<EnrichedLead> {
  if (!rawData) throw Object.assign(new Error("rawData is required."), { status: 400 });

  const ai = genaiClient();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: rawData,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: ENRICH_SCHEMA,
    },
  }));

  const text = response.text;
  if (!text) throw Object.assign(new Error("No response from Gemini."), { status: 502 });
  return JSON.parse(text);
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
    body_korean: `${draft.body_korean}${COMPLIANCE_FOOTER_KR}`,
    body_english: `${draft.body_english}${COMPLIANCE_FOOTER_EN}`,
  };
}

export async function generateEmailServer(lead: EnrichedLead): Promise<EmailDraft> {
  if (!lead) throw Object.assign(new Error("lead is required."), { status: 400 });

  const ai = genaiClient();
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
  if (!text) throw Object.assign(new Error("No response from Gemini."), { status: 502 });
  return applyEmailCompliance(JSON.parse(text));
}
