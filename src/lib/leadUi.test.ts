import { describe, it, expect } from 'vitest';
import { buildContactUpdate, sendBlockReason, isBlockedFromSending, factView } from './leadUi';
import type { EnrichedLead } from '../types';

const lead = { email: 'guess@naver.com', phone: '', website: null as string | null, student_age_range: '', approx_students: '' };
const edit = { email: 'guess@naver.com', phone: '', website: '', student_age_range: '', approx_students: '' };

describe('buildContactUpdate', () => {
  it('returns nothing when nothing changed', () =>
    expect(buildContactUpdate(lead, edit)).toEqual({ updates: {} }));
  it('stores a typed email as scraped and verified', () =>
    expect(buildContactUpdate(lead, { ...edit, email: ' real@academy.kr ' })).toEqual({
      updates: { email: 'real@academy.kr', email_confidence: 'scraped', email_verification: 'verified' },
    }));
  it('makes a cleared email unknown and unverified', () =>
    expect(buildContactUpdate(lead, { ...edit, email: '' })).toEqual({
      updates: { email: '', email_confidence: 'unknown', email_verification: 'unverified' },
    }));
  it('rejects an invalid email', () =>
    expect(buildContactUpdate(lead, { ...edit, email: 'not-an-email' })).toEqual({ error: 'That email address is not valid.' }));
  it('updates phone and website only', () =>
    expect(buildContactUpdate(lead, { ...edit, phone: '02-576-4726', website: 'https://blog.naver.com/bingo4726' })).toEqual({
      updates: { phone: '02-576-4726', website: 'https://blog.naver.com/bingo4726' },
    }));
  it('stores a cleared website as null', () =>
    expect(buildContactUpdate({ ...lead, website: 'https://a.kr' }, { ...edit, website: '' })).toEqual({ updates: { website: null } }));
});

describe('buildContactUpdate ages', () => {
  it('saves hand-entered ages and student count', () =>
    expect(buildContactUpdate(lead, { ...edit, student_age_range: '만 3–5세', approx_students: '40' })).toEqual({
      updates: { student_age_range: '만 3–5세', approx_students: '40' },
    }));
});

describe('send blocking for leads in manual review', () => {
  const base = { firebase_status: 'not_contacted', email_confidence: 'scraped', email_verification: 'verified' } as EnrichedLead;
  it('blocks a lead that needs an English check', () => {
    expect(isBlockedFromSending({ ...base, needs_review: true })).toBe(true);
    expect(sendBlockReason({ ...base, needs_review: true })).toBe('Confirm this school teaches English first.');
  });
  it('does not block a reviewed lead with a good email', () => {
    expect(isBlockedFromSending({ ...base, needs_review: false })).toBe(false);
    expect(sendBlockReason(base)).toBeNull();
  });
});

describe('factView', () => {
  const base = { chunk_id: 'a#0', quote: '만 3~5세', source_url: 'https://x.kr', source_type: 'website', verification: 'passed' } as const;
  it('shows a sourced fact with its link and quote', () =>
    expect(factView({ ...base, value: '만 3–5세', status: 'sourced' })).toEqual({ kind: 'sourced', text: '만 3–5세', quote: '만 3~5세', url: 'https://x.kr' }));
  it('marks an inferred fact', () =>
    expect(factView({ ...base, value: ['Pre-A1', 'A1'], status: 'inferred' })).toMatchObject({ kind: 'inferred', text: 'Pre-A1, A1' }));
  it('shows not found for not_found, a missing fact, or an empty value', () => {
    const nf = { value: null, status: 'not_found', chunk_id: null, quote: null, source_url: null, source_type: null, verification: null } as const;
    expect(factView(nf).kind).toBe('not_found');
    expect(factView(undefined).kind).toBe('not_found');
    expect(factView({ ...base, value: [], status: 'sourced' }).kind).toBe('not_found');
  });
});
