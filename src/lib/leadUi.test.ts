import { describe, it, expect } from 'vitest';
import { buildContactUpdate, sendBlockReason, isBlockedFromSending } from './leadUi';
import type { EnrichedLead } from '../types';

const lead = { email: 'guess@naver.com', phone: '', website: null as string | null };
const edit = { email: 'guess@naver.com', phone: '', website: '' };

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
