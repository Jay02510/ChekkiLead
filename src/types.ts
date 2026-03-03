export type InstitutionType = 'hagwon' | 'elementary_school' | 'kindergarten' | 'international_school' | 'tutoring_centre';
export type EmailConfidence = 'scraped' | 'estimated' | 'unknown';
export type CEFRLevel = 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type FirebaseStatus = 'pending' | 'sent' | 'replied' | 'bounced' | 'not_contacted';

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
  firebase_status: FirebaseStatus;
}

export interface EmailDraft {
  subject_line_kr: string;
  subject_line_en: string;
  subject_combined: string;
  body_korean: string;
  body_english: string;
  cta_primary: string;
  cta_secondary?: string | null;
  personalisation_note: string;
  institution_type_targeted: string;
  word_count_kr?: number;
  word_count_en?: number;
}
