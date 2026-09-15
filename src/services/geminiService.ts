import { EnrichedLead, EmailDraft } from "../types";

// This used to call the Gemini SDK directly from the browser with
// process.env.GEMINI_API_KEY baked in via vite.config.ts `define` — which
// meant the API key shipped in the client JS bundle, readable by anyone via
// dev tools. Both calls now go through server.ts, which holds the key
// server-side only. Function signatures are unchanged so nothing else in
// the app needs to know this moved.

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request to ${url} failed (${res.status})`);
  }
  return data as T;
}

export async function enrichLead(rawData: string): Promise<EnrichedLead> {
  return postJson<EnrichedLead>("/api/enrich-lead", { rawData });
}

export async function generateEmailDraft(lead: EnrichedLead): Promise<EmailDraft> {
  return postJson<EmailDraft>("/api/generate-email", { lead });
}
