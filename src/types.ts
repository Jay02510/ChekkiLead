export type InstitutionType = 'hagwon' | 'elementary_school' | 'kindergarten' | 'international_school' | 'tutoring_centre';
export type EmailConfidence = 'scraped' | 'estimated' | 'unknown';
export type CEFRLevel = 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type FirebaseStatus = 'pending' | 'sent' | 'replied' | 'bounced' | 'not_contacted' | 'opted_out';
export type VerificationStatus = 'unverified' | 'verified';

export interface NaverSearchResult {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

export interface EnrichedLead {
  institution_name_en: string;
  institution_name_kr: string;
  institution_type: InstitutionType;
  city: string;
  district: string;
  address_full?: string;
  director_name?: string | null;
  email: string;
  email_confidence: EmailConfidence;
  phone: string;
  website?: string | null;
  naver_id: string;
  instagram?: string | null;
  student_age_range: string;
  approx_students: string;
  cefr_levels_taught?: CEFRLevel[];
  outreach_priority: number;
  fit_reason: string;
  agent_notes?: string;
  personalization_hook?: string;
  firebase_status: FirebaseStatus;
  email_verification?: VerificationStatus;
  last_contacted_at?: string | null;
  saved_at?: string;
  sequence_step?: number;
  deleted?: boolean;
  naver_raw?: NaverSearchResult;
  non_target?: boolean;
  // Set in code from the Naver listing (englishSignal), never by the model.
  // 'unsure' leads wait in the Review queue until a person confirms English.
  english_signal?: 'confirmed' | 'unsure';
  // Present on leads enriched from sources (see src/lib/rag/ground.ts).
  facts?: GroundedFacts;
  grounding?: Grounding;
  // Fields a person typed in; re-enrichment must not overwrite them.
  manual_fields?: string[];
  needs_review?: boolean;
  // Phase 1 source collection (written server-side by scripts/collect-sources.ts).
  sources_collected_at?: string;
  source_counts?: { blog_own: number; blog_third_party: number; website: number; errors: number };
  candidate_emails?: CandidateEmail[];
}

// An address found in collected text. Third-party blog emails usually belong
// to the blogger, not the academy, so later steps use only blog_own and
// website entries (see isOwnSourceEmail in src/lib/rag/collect.ts).
export interface CandidateEmail {
  email: string;
  sourceId: string;
  sourceType: SourceType;
}

// How a lead is enriched. baseline = the frozen original prompt (the control);
// the grounded modes answer only from collected source chunks.
export type SourceType = 'blog_own' | 'blog_third_party' | 'website';

export type FactStatus = 'sourced' | 'inferred' | 'not_found';

// One fact answered from collected source chunks. sourced: the chunk states
// it. inferred: reasoned from a cited quote ("초등 1~3학년 파닉스반" -> levels).
// not_found: nothing supports a value; value, chunk_id and quote are null.
// verification is set by code (verifyFacts), and source_url / source_type
// come from the chunk, never from the model.
export interface GroundedFact<V = string | string[]> {
  value: V | null;
  status: FactStatus;
  chunk_id: string | null;
  quote: string | null;
  source_url: string | null;
  source_type: SourceType | null;
  verification: 'passed' | 'failed' | null;
  // Cited quotes that failed verification, kept for debugging.
  rejected?: { chunk_id: string | null; quote: string | null; reason: string }[];
}

export interface GroundedFacts {
  age_range: GroundedFact<string>;
  approx_students: GroundedFact<string>;
  cefr_levels: GroundedFact<string[]>;
  hook: GroundedFact<string>;
}

export interface Grounding {
  mode: GroundedMode;
  chunks_given: number;
  chunks_dropped: number;
  verification_failures: number;
  enriched_at: string;
}

export type EnrichMode = 'baseline' | 'grounded_full' | 'grounded_retrieval';
export type GroundedMode = Exclude<EnrichMode, 'baseline'>;

export interface EmailDraft {
  subject_line_kr: string;
  subject_line_en: string;
  subject_combined: string;
  subject_line_kr_b: string;
  subject_line_en_b: string;
  subject_combined_b: string;
  body_korean: string;
  body_english: string;
  cta_primary: string;
  cta_secondary?: string | null;
  personalisation_note: string;
  institution_type_targeted: string;
  word_count_kr?: number;
  word_count_en?: number;
}
