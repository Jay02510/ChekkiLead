import { EnrichedLead, FirebaseStatus } from '../types';

export const STATUS_OPTIONS: { value: FirebaseStatus; label: string }[] = [
  { value: 'not_contacted', label: 'Not contacted' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'opted_out', label: 'Opted out' },
];

export const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label])) as Record<FirebaseStatus, string>;

export const STATUS_DOT: Record<FirebaseStatus, string> = {
  not_contacted: 'bg-zinc-400',
  pending: 'bg-amber-400',
  sent: 'bg-sky-400',
  replied: 'bg-emerald-400',
  bounced: 'bg-red-400',
  opted_out: 'bg-zinc-600',
};

const INSTITUTION_LABELS: Record<string, string> = {
  hagwon: 'Hagwon',
  elementary_school: 'Elementary school',
  kindergarten: 'Kindergarten',
  international_school: 'International school',
  tutoring_centre: 'Tutoring centre',
};
export const institutionLabel = (type: string) => INSTITUTION_LABELS[type] || type;

export const priorityTone = (priority: number) => {
  if (priority >= 4) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
  if (priority === 3) return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
  return 'bg-white/5 text-zinc-300 border-white/10';
};

export const needsVerification = (lead: EnrichedLead) =>
  lead.email_confidence === 'estimated' && lead.email_verification !== 'verified';

// The one rule for "can this lead be marked sent": unknown emails never,
// estimated emails only once a human verified them. Opt-outs are locked.
export const sendBlockReason = (lead: EnrichedLead): string | null => {
  if (lead.firebase_status === 'opted_out') return 'This lead opted out.';
  if (lead.needs_review) return 'Confirm this school teaches English first.';
  if (lead.email_confidence === 'unknown') return 'No email yet. Add one with Edit details.';
  if (needsVerification(lead)) return 'Verify the email address first.';
  return null;
};

export const isBlockedFromSending = (lead: EnrichedLead) =>
  !!lead.needs_review || lead.email_confidence === 'unknown' || needsVerification(lead);

export interface ContactEdit {
  email: string;
  phone: string;
  website: string;
  student_age_range: string;
  approx_students: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turns the edit form into a Firestore update holding only what changed.
// An address a person typed in is one they found on the academy's own page, so
// it is stored as scraped and verified. Clearing the email makes it unknown.
export function buildContactUpdate(
  lead: Pick<EnrichedLead, 'email' | 'phone' | 'website' | 'student_age_range' | 'approx_students'>,
  edit: ContactEdit,
): { updates: Record<string, string | null> } | { error: string } {
  const email = edit.email.trim();
  const phone = edit.phone.trim();
  const website = edit.website.trim();
  if (email && !EMAIL_RE.test(email)) return { error: 'That email address is not valid.' };

  const updates: Record<string, string | null> = {};
  if (email !== (lead.email || '')) {
    updates.email = email;
    updates.email_confidence = email ? 'scraped' : 'unknown';
    updates.email_verification = email ? 'verified' : 'unverified';
  }
  if (phone !== (lead.phone || '')) updates.phone = phone;
  if (website !== (lead.website || '')) updates.website = website || null;
  const age = edit.student_age_range.trim();
  const students = edit.approx_students.trim();
  if (age !== (lead.student_age_range || '')) updates.student_age_range = age;
  if (students !== (lead.approx_students || '')) updates.approx_students = students;
  return { updates };
}
