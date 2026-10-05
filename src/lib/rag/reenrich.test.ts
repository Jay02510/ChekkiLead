import { describe, it, expect } from 'vitest';
import { mergeGrounded, sourcesAreFresh, SOURCES_MAX_AGE_DAYS } from './reenrich';
import { canReenrich } from '../leadUi';
import type { EnrichedLead } from '../../types';

const grounded = (over: Partial<EnrichedLead> = {}) => ({
  email: '', email_confidence: 'unknown', student_age_range: '만 5–7세', approx_students: 'not found', cefr_levels_taught: [],
  personalization_hook: '겨울방학 특강', outreach_priority: 4, fit_reason: 'f', agent_notes: 'n',
  facts: { marker: 'facts' }, grounding: { marker: 'grounding' }, ...over,
}) as unknown as EnrichedLead;

const lead = (over: Partial<EnrichedLead> = {}) => ({
  email: 'guess@naver.com', email_confidence: 'estimated', student_age_range: '5–12 years', approx_students: '60–100', ...over,
}) as unknown as EnrichedLead;

describe('mergeGrounded', () => {
  it('writes the facts and the flat fields they fill', () => {
    const u = mergeGrounded(lead(), grounded());
    expect(u).toMatchObject({ facts: { marker: 'facts' }, grounding: { marker: 'grounding' }, student_age_range: '만 5–7세', personalization_hook: '겨울방학 특강', outreach_priority: 4 });
  });
  it('keeps ages and student count a person typed in', () => {
    const u = mergeGrounded(lead({ manual_fields: ['student_age_range', 'approx_students'] }), grounded());
    expect(u).not.toHaveProperty('student_age_range');
    expect(u).not.toHaveProperty('approx_students');
  });
  it('clears a guessed email when no own-source email was found', () =>
    expect(mergeGrounded(lead(), grounded())).toMatchObject({ email: '', email_confidence: 'unknown' }));
  it('sets an own-source email as scraped', () =>
    expect(mergeGrounded(lead(), grounded({ email: 'info@academy.kr' }))).toMatchObject({ email: 'info@academy.kr', email_confidence: 'scraped' }));
  it('keeps a typed or verified email', () => {
    expect(mergeGrounded(lead({ manual_fields: ['email'] }), grounded())).not.toHaveProperty('email');
    expect(mergeGrounded(lead({ email_verification: 'verified' }), grounded({ email: 'other@x.kr' }))).not.toHaveProperty('email');
  });
  it('leaves an already-scraped email alone when none was found this time', () =>
    expect(mergeGrounded(lead({ email_confidence: 'scraped' }), grounded())).not.toHaveProperty('email'));
});

describe('sourcesAreFresh', () => {
  const now = Date.parse('2026-10-05T00:00:00Z');
  it('is fresh inside the window and stale outside it, or when never collected', () => {
    expect(sourcesAreFresh({ sources_collected_at: '2026-09-20T00:00:00Z' }, now)).toBe(true);
    expect(sourcesAreFresh({ sources_collected_at: new Date(now - (SOURCES_MAX_AGE_DAYS + 1) * 86_400_000).toISOString() }, now)).toBe(false);
    expect(sourcesAreFresh({}, now)).toBe(false);
  });
});

describe('canReenrich', () => {
  const ok = { deleted: false, non_target: false, firebase_status: 'not_contacted', naver_raw: {} } as any;
  it('allows an untouched lead', () => expect(canReenrich(ok)).toBe(true));
  it('skips deleted, non-target, opted out, sent and listing-less leads', () => {
    expect(canReenrich({ ...ok, deleted: true })).toBe(false);
    expect(canReenrich({ ...ok, non_target: true })).toBe(false);
    expect(canReenrich({ ...ok, firebase_status: 'opted_out' })).toBe(false);
    expect(canReenrich({ ...ok, firebase_status: 'sent' })).toBe(false);
    expect(canReenrich({ ...ok, firebase_status: 'replied' })).toBe(false);
    expect(canReenrich({ ...ok, naver_raw: undefined })).toBe(false);
  });
});
