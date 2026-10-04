// Zod schemas validating what Gemini returns before it's saved anywhere.
// responseSchema (geminiPrompts.ts) only constrains generation — the model
// can still return malformed or out-of-enum JSON under load. Validating
// here, server-side, catches that before a bad lead or draft ever reaches
// Firestore.
import { z } from "zod";

const institutionType = z.enum(["hagwon", "elementary_school", "kindergarten", "international_school", "tutoring_centre"]);
const emailConfidence = z.enum(["scraped", "estimated", "unknown"]);
const cefrLevel = z.enum(["Pre-A1", "A1", "A2", "B1", "B2", "C1"]);
const firebaseStatus = z.enum(["pending", "sent", "replied", "bounced", "not_contacted", "opted_out"]);

export const NaverItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  category: z.string(),
  description: z.string(),
  telephone: z.string(),
  address: z.string(),
  roadAddress: z.string(),
  mapx: z.string(),
  mapy: z.string(),
});

export const EnrichedLeadSchema = z.object({
  institution_name_en: z.string().min(1),
  institution_name_kr: z.string().min(1),
  institution_type: institutionType,
  city: z.string().min(1),
  district: z.string().min(1),
  address_full: z.string().optional(),
  director_name: z.string().nullable().optional(),
  email: z.string().min(1),
  email_confidence: emailConfidence,
  phone: z.string(),
  website: z.string().nullable().optional(),
  naver_id: z.string().min(1),
  instagram: z.string().nullable().optional(),
  student_age_range: z.string().min(1),
  approx_students: z.string().min(1),
  cefr_levels_taught: z.array(cefrLevel).optional(),
  outreach_priority: z.number().int().min(1).max(5),
  fit_reason: z.string().min(1),
  agent_notes: z.string().optional(),
  personalization_hook: z.string().optional(),
  firebase_status: firebaseStatus,
  email_verification: z.enum(["unverified", "verified"]).optional(),
  last_contacted_at: z.string().nullable().optional(),
  saved_at: z.string().optional(),
  sequence_step: z.number().optional(),
  deleted: z.boolean().optional(),
  naver_raw: NaverItemSchema.optional(),
});

export const EmailDraftSchema = z.object({
  subject_line_kr: z.string().min(1),
  subject_line_en: z.string().min(1),
  subject_combined: z.string().min(1),
  subject_line_kr_b: z.string().min(1),
  subject_line_en_b: z.string().min(1),
  subject_combined_b: z.string().min(1),
  body_korean: z.string().min(1),
  body_english: z.string().min(1),
  cta_primary: z.string().min(1),
  cta_secondary: z.string().nullable().optional(),
  personalisation_note: z.string().min(1),
  institution_type_targeted: z.string().min(1),
  word_count_kr: z.number().optional(),
  word_count_en: z.number().optional(),
});
